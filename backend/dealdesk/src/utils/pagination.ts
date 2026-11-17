import type { FilterQuery, Model } from 'mongoose';
import { Types } from 'mongoose';
import { ApiError } from './ApiError';
import { isObjectIdString } from './objectId';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface Pagination {
  limit: number;
  cursor: string | null;
}

export type PaginationSort = Record<string, 1 | -1>;

export interface PaginateOptions {
  limit: number;
  cursor?: string | null;
  sort?: PaginationSort;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export function parseLimit(rawLimit: unknown): number {
  const numericLimit =
    typeof rawLimit === 'string'
      ? Number(rawLimit)
      : typeof rawLimit === 'number'
        ? rawLimit
        : Number.NaN;

  return Number.isInteger(numericLimit) && numericLimit > 0
    ? Math.min(numericLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
}

export function parsePagination(
  query: Record<string, unknown> = {},
): Pagination {
  const limit = parseLimit(query.limit);
  const rawCursor = query.cursor;

  if (rawCursor === undefined || rawCursor === null || rawCursor === '') {
    return { limit, cursor: null };
  }

  if (!isObjectIdString(rawCursor)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }

  return { limit, cursor: rawCursor };
}

export async function paginateQuery<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  options: PaginateOptions,
): Promise<PaginatedResult<T>> {
  const limit = Math.min(Math.max(options.limit, 1), MAX_LIMIT);
  const sort: PaginationSort = options.sort ?? { _id: -1 };
  const cursor = options.cursor ?? null;

  if (cursor !== null && !isObjectIdString(cursor)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }

  const queryFilter = {
    ...filter,
    ...(cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {}),
  } as FilterQuery<T>;

  const items = (await model
    .find(queryFilter)
    .sort(sort)
    .limit(limit + 1)
    .lean()
    .exec()) as unknown as T[];

  const hasNextPage = items.length > limit;
  const pageItems = hasNextPage ? items.slice(0, limit) : items;
  const lastItem = pageItems[pageItems.length - 1] as
    | { _id?: Types.ObjectId | string }
    | undefined;
  const nextCursor =
    hasNextPage && lastItem?._id ? String(lastItem._id) : null;

  return { items: pageItems, nextCursor };
}
