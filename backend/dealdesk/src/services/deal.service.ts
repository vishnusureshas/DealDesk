import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { Customer } from '../models/Customer';
import {
  Deal,
  type DealAttrs,
  type DealItem,
  type DealStatus,
} from '../models/Deal';
import { DiscountRequest } from '../models/DiscountRequest';
import { Product } from '../models/Product';
import type { Scope } from '../models/Role';
import { ApiError } from '../utils/ApiError';
import { assertIntegerMinorUnits } from '../utils/money';
import { isObjectIdString } from '../utils/objectId';
import {
  paginateQuery,
  parsePagination,
  type PaginatedResult,
} from '../utils/pagination';
import {
  dealScopeFilter,
  type ScopeUser,
} from '../utils/scope';
import { createDealThread } from './chat.service';

export interface DealActor extends ScopeUser {
  managerId: Types.ObjectId | null;
}

export interface DealItemInput {
  productId: string;
  qty: number;
}

export interface CreateDealInput {
  title: string;
  customerId: string;
  items: DealItemInput[];
}

export interface UpdateDealInput {
  title?: string;
  customerId?: string;
  items?: DealItemInput[];
}

async function assertCustomerExists(customerId: string): Promise<void> {
  const customer = await Customer.exists({ _id: customerId });

  if (!customer) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `Unknown customerId: ${customerId}`,
    );
  }
}

async function resolveItemSnapshots(
  items: DealItemInput[],
): Promise<{ items: DealItem[]; subtotal: number }> {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await Product.find({
    _id: { $in: productIds },
  }).exec();
  const productsById = new Map(
    products.map((product) => [product._id.toString(), product]),
  );
  const missingProductIds = productIds.filter(
    (productId) => !productsById.has(productId),
  );

  if (missingProductIds.length > 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `Unknown productId: ${missingProductIds.join(', ')}`,
    );
  }

  const resolvedItems = items.map((item) => {
    const product = productsById.get(item.productId);

    if (!product) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `Unknown productId: ${item.productId}`,
      );
    }

    return {
      productId: product._id,
      qty: item.qty,
      price: product.price,
    };
  });

  const subtotal = resolvedItems.reduce(
    (sum, item) => sum + item.qty * item.price,
    0,
  );

  assertIntegerMinorUnits(subtotal, 'subtotal');

  return { items: resolvedItems, subtotal };
}

async function findDealByScope(
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
  }).exec();

  if (!deal) {
    throw new ApiError(404, 'NOT_FOUND', 'Deal not found');
  }

  return deal;
}

export async function listDeals(
  user: ScopeUser,
  scope: Scope,
  query: Record<string, unknown>,
  status?: DealStatus,
): Promise<PaginatedResult<DealAttrs>> {
  const { limit, cursor } = parsePagination(query);
  const filter = {
    ...dealScopeFilter<DealAttrs>(user, scope),
    ...(status ? { status } : {}),
  } as FilterQuery<DealAttrs>;

  return paginateQuery<DealAttrs>(Deal, filter, {
    limit,
    cursor,
    sort: { _id: -1 },
  });
}

export async function createDeal(
  user: DealActor,
  input: CreateDealInput,
) {
  await assertCustomerExists(input.customerId);
  const { items, subtotal } = await resolveItemSnapshots(input.items);
  const createdAt = new Date();
  const deal = await Deal.create({
    title: input.title,
    customerId: new Types.ObjectId(input.customerId),
    ownerId: user._id,
    branchId: user.branchId,
    items,
    subtotal,
    discountPct: 0,
    total: 0,
    status: 'open',
    rejectionReason: null,
    convertedAt: null,
  });

  await createDealThread(
    deal._id,
    deal.ownerId,
    user.managerId,
    createdAt,
  );

  return deal;
}

export async function getDeal(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
) {
  return findDealByScope(dealId, user, scope);
}

export async function updateDeal(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
  input: UpdateDealInput,
) {
  const deal = await findDealByScope(dealId, user, scope);

  if (deal.status !== 'open') {
    throw new ApiError(
      409,
      'CONFLICT',
      'Deal is not open for editing',
    );
  }

  const pendingRequest = await DiscountRequest.exists({
    dealId: deal._id,
    status: 'pending',
  });

  if (pendingRequest) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Deal has a pending discount request',
    );
  }

  let customerId: Types.ObjectId | undefined;
  let itemSnapshots:
    | { items: DealItem[]; subtotal: number }
    | undefined;

  if (input.customerId !== undefined) {
    await assertCustomerExists(input.customerId);
    customerId = new Types.ObjectId(input.customerId);
  }

  if (input.items !== undefined) {
    itemSnapshots = await resolveItemSnapshots(input.items);
  }

  if (input.title !== undefined) {
    deal.title = input.title;
  }

  if (customerId) {
    deal.customerId = customerId;
  }

  if (itemSnapshots) {
    deal.items = itemSnapshots.items;
    deal.subtotal = itemSnapshots.subtotal;
  }

  await deal.save();
  return deal;
}
