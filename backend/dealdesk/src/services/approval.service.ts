import { Types, type HydratedDocument, type UpdateQuery } from 'mongoose';
import { emitDomainEvent } from '../events/bus';
import { ApprovalConfig } from '../models/ApprovalConfig';
import {
  ApprovalHistory,
  type ApprovalHistoryAttrs,
} from '../models/ApprovalHistory';
import { Deal, type DealAttrs } from '../models/Deal';
import {
  DiscountRequest,
  type DiscountChainStep,
  type DiscountRequestAttrs,
} from '../models/DiscountRequest';
import { Role, type Scope } from '../models/Role';
import { ApiError } from '../utils/ApiError';
import { computeTotal } from '../utils/money';
import { isObjectIdString } from '../utils/objectId';
import { parsePagination, paginateQuery } from '../utils/pagination';
import {
  dealScopeFilter,
  discountRequestScopeFilter,
  type ScopeUser,
} from '../utils/scope';

export interface ApprovalBandInput {
  minPct: number;
  maxPct: number;
  chain: string[];
}

export async function getApprovalConfig() {
  return ApprovalConfig.find().sort({ minPct: 1 }).exec();
}

export async function saveApprovalConfig(
  bands: ApprovalBandInput[],
) {
  const sorted = [...bands].sort((a, b) => a.minPct - b.minPct);

  if (sorted.length === 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'At least one approval band is required',
    );
  }

  if (sorted[0].minPct !== 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Approval bands must start at 0',
    );
  }

  if (sorted[sorted.length - 1].maxPct !== 100) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Approval bands must end at 100',
    );
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const band = sorted[index];

    if (
      band.minPct < 0 ||
      band.maxPct > 100 ||
      band.minPct >= band.maxPct
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Each band must satisfy 0 <= minPct < maxPct <= 100',
      );
    }

    if (
      index < sorted.length - 1 &&
      band.maxPct !== sorted[index + 1].minPct
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Approval bands must be contiguous with no gaps or overlaps',
      );
    }
  }

  const roleKeys = [...new Set(sorted.flatMap((band) => band.chain))];

  if (roleKeys.length > 0) {
    const roles = await Role.find({ key: { $in: roleKeys } }).exec();
    const rolesByKey = new Map(roles.map((role) => [role.key, role]));

    for (const key of roleKeys) {
      const role = rolesByKey.get(key);

      if (!role) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          `Unknown role in approval chain: ${key}`,
        );
      }

      const canApprove = role.permissions.some(
        (permission) => permission.key === 'discount.approve',
      );

      if (!canApprove) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          `Role cannot approve discounts: ${key}`,
        );
      }
    }
  }

  await ApprovalConfig.deleteMany({});
  return ApprovalConfig.insertMany(sorted);
}

export async function resolveChain(pct: number): Promise<string[]> {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'pct must be between 0 and 100',
    );
  }

  if (pct === 0) {
    return [];
  }

  const band = await ApprovalConfig.findOne({
    minPct: { $lt: pct },
    maxPct: { $gte: pct },
  })
    .sort({ minPct: 1 })
    .exec();

  if (!band) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `No approval band matches ${pct}%`,
    );
  }

  return band.chain;
}

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function appendHistory(
  entry: ApprovalHistoryAttrs,
): Promise<void> {
  try {
    await ApprovalHistory.create(entry);
  } catch (firstError) {
    console.error(
      '[approval] Failed to append approval history; retrying once',
      firstError,
    );

    try {
      await ApprovalHistory.create(entry);
    } catch (secondError) {
      console.error(
        '[approval] Failed to append approval history after retry',
        secondError,
      );
    }
  }
}

function snapshotChain(roleKeys: string[]): DiscountChainStep[] {
  return roleKeys.map((roleKey, index) => ({
    step: index + 1,
    roleKey,
  }));
}

export async function requestDiscount(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
  pct: number,
) {
  if (!isObjectIdString(dealId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Deal not found');
  }

  const deal = await Deal.findOne({
    _id: dealId,
    ...dealScopeFilter<DealAttrs>(user, scope),
  }).exec();

  if (!deal || deal.ownerId.toString() !== user._id.toString()) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Only the deal owner can request a discount',
    );
  }

  if (deal.status !== 'open') {
    throw new ApiError(
      409,
      'CONFLICT',
      'Deal is not open for a discount request',
    );
  }

  const pending = await DiscountRequest.exists({
    dealId: deal._id,
    status: 'pending',
  });

  if (pending) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Deal already has a pending discount request',
    );
  }

  const roleKeys = await resolveChain(pct);
  const chain = snapshotChain(roleKeys);

  if (chain.length === 0) {
    const request = await DiscountRequest.create({
      dealId: deal._id,
      branchId: deal.branchId,
      requestedBy: user._id,
      pct,
      chain: [],
      currentStep: 0,
      currentRole: null,
      status: 'auto_approved',
      rejectionReason: null,
    });

    const transitioned = await Deal.findOneAndUpdate(
      { _id: deal._id, status: 'open' },
      {
        $set: {
          status: 'won',
          discountPct: pct,
          total: computeTotal(deal.subtotal, pct),
          rejectionReason: null,
        },
      },
      { new: true },
    ).exec();

    if (!transitioned) {
      await DiscountRequest.deleteOne({ _id: request._id }).exec();
      throw new ApiError(
        409,
        'CONFLICT',
        'Deal is no longer open',
      );
    }

    await appendHistory({
      requestId: request._id,
      dealId: deal._id,
      step: 0,
      approverRole: null,
      approverId: null,
      action: 'auto_approved',
      remarks: null,
      timestamp: new Date(),
    });

    emitDomainEvent('approval.decided', {
      requestId: request._id,
      dealId: deal._id,
      action: 'auto_approved',
      requesterId: user._id,
    });

    return request;
  }

  let request: HydratedDocument<DiscountRequestAttrs>;

  try {
    request = await DiscountRequest.create({
      dealId: deal._id,
      branchId: deal.branchId,
      requestedBy: user._id,
      pct,
      chain,
      currentStep: 1,
      currentRole: chain[0].roleKey,
      status: 'pending',
      rejectionReason: null,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ApiError(
        409,
        'CONFLICT',
        'Deal already has a pending discount request',
      );
    }

    throw error;
  }

  const transitioned = await Deal.findOneAndUpdate(
    { _id: deal._id, status: 'open' },
    { $set: { status: 'pending_approval' } },
    { new: true },
  ).exec();

  if (!transitioned) {
    await DiscountRequest.deleteOne({ _id: request._id }).exec();
    throw new ApiError(409, 'CONFLICT', 'Deal is no longer open');
  }

  await appendHistory({
    requestId: request._id,
    dealId: deal._id,
    step: 0,
    approverRole: null,
    approverId: toObjectId(user._id),
    action: 'requested',
    remarks: null,
    timestamp: new Date(),
  });

  emitDomainEvent('approval.requested', {
    requestId: request._id,
    dealId: deal._id,
    pct,
    currentRole: chain[0].roleKey,
    branchId: deal.branchId,
  });

  return request;
}

export async function listDealDiscountRequests(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
) {
  if (!isObjectIdString(dealId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Deal not found');
  }

  const deal = await Deal.findOne({
    _id: dealId,
    ...dealScopeFilter<DealAttrs>(user, scope),
  })
    .select('_id')
    .exec();

  if (!deal) {
    throw new ApiError(404, 'NOT_FOUND', 'Deal not found');
  }

  return DiscountRequest.find({ dealId: deal._id })
    .sort({ _id: -1 })
    .limit(20)
    .lean()
    .exec();
}

export async function listPendingApprovals(
  user: ScopeUser,
  roleKey: string,
  scope: Scope,
  query: Record<string, unknown>,
) {
  const { limit, cursor } = parsePagination(query);

  if (scope === 'own') {
    return { items: [], nextCursor: null };
  }

  const filter = {
    status: 'pending' as const,
    currentRole: roleKey,
    requestedBy: { $ne: user._id },
    ...(scope === 'branch' ? { branchId: user.branchId } : {}),
  };

  return paginateQuery<DiscountRequestAttrs>(
    DiscountRequest,
    filter,
    { limit, cursor, sort: { _id: -1 } },
  );
}

export async function getApprovalRequest(
  requestId: string,
  user: ScopeUser,
  scope: Scope,
) {
  if (!isObjectIdString(requestId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Approval request not found');
  }

  const request = await DiscountRequest.findOne({
    _id: requestId,
    ...discountRequestScopeFilter<DiscountRequestAttrs>(user, scope),
  }).exec();

  if (!request) {
    throw new ApiError(404, 'NOT_FOUND', 'Approval request not found');
  }

  const history = await ApprovalHistory.find({
    requestId: request._id,
  })
    .sort({ timestamp: 1, _id: 1 })
    .lean()
    .exec();

  return {
    request: request.toObject(),
    history,
  };
}

export interface DecisionInput {
  action: 'approve' | 'reject';
  remarks?: string;
}

export async function decideDiscountRequest(
  requestId: string,
  user: ScopeUser,
  roleKey: string,
  scope: Scope,
  input: DecisionInput,
) {
  if (!isObjectIdString(requestId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Approval request not found');
  }

  const request = await DiscountRequest.findById(requestId).exec();

  if (!request) {
    throw new ApiError(404, 'NOT_FOUND', 'Approval request not found');
  }

  if (request.status !== 'pending') {
    throw new ApiError(
      409,
      'CONFLICT',
      'Approval request is not pending',
    );
  }

  if (request.requestedBy.toString() === user._id.toString()) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Requesters cannot decide their own discount request',
    );
  }

  const callerSteps = request.chain.filter(
    (step) => step.roleKey === roleKey,
  );

  if (callerSteps.length === 0) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Your role is not in this approval chain',
    );
  }

  if (request.currentRole !== roleKey) {
    if (
      callerSteps.some((step) => step.step < request.currentStep)
    ) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Your approval step is already completed',
      );
    }

    if (
      callerSteps.some((step) => step.step > request.currentStep)
    ) {
      throw new ApiError(
        409,
        'CONFLICT',
        'A previous approval step is still pending',
      );
    }

    throw new ApiError(
      403,
      'FORBIDDEN',
      'Your role is not the current approval step',
    );
  }

  if (scope === 'own') {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Your approval scope does not cover this request',
    );
  }

  if (
    scope === 'branch' &&
    request.branchId.toString() !== user.branchId.toString()
  ) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Your approval scope does not cover this request',
    );
  }

  const deal = await Deal.findById(request.dealId).exec();

  if (!deal) {
    throw new ApiError(
      500,
      'INTERNAL_ERROR',
      'Deal not found for approval request',
    );
  }

  const currentIndex = request.chain.findIndex(
    (step) => step.step === request.currentStep,
  );

  if (currentIndex === -1) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Approval request has an invalid current step',
    );
  }

  const isLastStep = currentIndex === request.chain.length - 1;
  const nextStep = isLastStep
    ? null
    : request.chain[currentIndex + 1];

  let gateUpdate: UpdateQuery<DiscountRequestAttrs>;

  if (input.action === 'approve') {
    gateUpdate = isLastStep
      ? {
          $set: {
            status: 'approved',
            currentRole: null,
          },
        }
      : {
          $set: {
            currentStep: request.currentStep + 1,
            currentRole: nextStep?.roleKey ?? null,
          },
        };
  } else {
    const chain = request.chain.map((step) => ({
      step: step.step,
      roleKey: step.roleKey,
      ...(step.step > request.currentStep
        ? { outcome: 'skipped' as const }
        : step.outcome
          ? { outcome: step.outcome }
          : {}),
    }));

    gateUpdate = {
      $set: {
        status: 'rejected',
        currentRole: null,
        rejectionReason: input.remarks ?? null,
        chain,
      },
    };
  }

  const gate = await DiscountRequest.findOneAndUpdate(
    {
      _id: request._id,
      status: 'pending',
      currentStep: request.currentStep,
      currentRole: roleKey,
    },
    gateUpdate,
    { new: true },
  ).exec();

  if (!gate) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Approval step already decided',
    );
  }

  let dealState = deal;

  if (input.action === 'approve' && isLastStep) {
    const transitionedDeal = await Deal.findOneAndUpdate(
      { _id: request.dealId, status: 'pending_approval' },
      {
        $set: {
          status: 'won',
          discountPct: request.pct,
          total: computeTotal(deal.subtotal, request.pct),
          rejectionReason: null,
        },
      },
      { new: true },
    ).exec();

    dealState = transitionedDeal ?? deal;
  } else if (input.action === 'reject') {
    const transitionedDeal = await Deal.findOneAndUpdate(
      { _id: request.dealId, status: 'pending_approval' },
      {
        $set: {
          status: 'open',
          rejectionReason: input.remarks ?? null,
          discountPct: 0,
          total: 0,
        },
      },
      { new: true },
    ).exec();

    dealState = transitionedDeal ?? deal;
  }

  await appendHistory({
    requestId: request._id,
    dealId: request.dealId,
    step: request.currentStep,
    approverRole: roleKey,
    approverId: toObjectId(user._id),
    action: input.action,
    remarks: input.remarks ?? null,
    timestamp: new Date(),
  });

  if (input.action === 'approve' && !isLastStep) {
    emitDomainEvent('approval.advanced', {
      requestId: gate._id,
      dealId: gate.dealId,
      step: gate.currentStep,
      currentRole: gate.currentRole ?? '',
      branchId: gate.branchId,
    });
  } else {
    emitDomainEvent('approval.decided', {
      requestId: gate._id,
      dealId: gate.dealId,
      action: input.action,
      requesterId: gate.requestedBy,
    });
  }

  return { request: gate, deal: dealState };
}
