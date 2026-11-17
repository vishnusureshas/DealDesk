import type { RequestHandler } from 'express';
import * as approvalService from '../services/approval.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

function getScopedContext(req: Parameters<RequestHandler>[0]) {
  if (!req.user || !req.scope) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  }

  return { user: req.user, scope: req.scope };
}

function getRoleKey(req: Parameters<RequestHandler>[0]): string {
  if (!req.role) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  }

  return req.role.key;
}

export const requestDiscount: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const { pct } = req.body as { pct: number };
    const request = await approvalService.requestDiscount(
      req.params.id,
      user,
      scope,
      pct,
    );

    res.status(201).json(request);
  },
);

export const listPendingApprovals: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const result = await approvalService.listPendingApprovals(
      user,
      getRoleKey(req),
      scope,
      req.query as Record<string, unknown>,
    );

    res.status(200).json(result);
  },
);

export const getApprovalRequest: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const request = await approvalService.getApprovalRequest(
      req.params.id,
      user,
      scope,
    );

    res.status(200).json(request);
  },
);

export const decideApprovalRequest: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const request = await approvalService.decideDiscountRequest(
      req.params.id,
      user,
      getRoleKey(req),
      scope,
      req.body as approvalService.DecisionInput,
    );

    res.status(200).json(request);
  },
);
