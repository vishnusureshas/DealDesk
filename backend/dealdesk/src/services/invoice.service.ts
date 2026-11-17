import { randomUUID } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import { Deal, type DealAttrs } from '../models/Deal';
import {
  Invoice,
  type InvoiceAttrs,
  type InvoicePushState,
  type InvoiceStatus,
} from '../models/Invoice';
import {
  IntegrationLog,
  type IntegrationLogAttrs,
} from '../models/IntegrationLog';
import type { Scope } from '../models/Role';
import { Sale } from '../models/Sale';
import { ApiError } from '../utils/ApiError';
import { isObjectIdString } from '../utils/objectId';
import { parsePagination, paginateQuery } from '../utils/pagination';
import {
  invoiceScopeFilter,
  type ScopeUser,
} from '../utils/scope';
import { applyLedgerEntry } from './balance.service';
import { getDeal } from './deal.service';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function upsertSaleForDeal(
  deal: HydratedDocument<DealAttrs>,
) {
  try {
    const sale = await Sale.findOneAndUpdate(
      { dealId: deal._id },
      {
        $setOnInsert: {
          dealId: deal._id,
          customerId: deal.customerId,
          amount: deal.total,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).exec();

    if (!sale) {
      throw new ApiError(
        500,
        'INTERNAL_ERROR',
        'Failed to create sale',
      );
    }

    return sale;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await Sale.findOne({
        dealId: deal._id,
      }).exec();

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

export async function upsertInvoiceForDeal(
  deal: HydratedDocument<DealAttrs>,
) {
  const sale = await upsertSaleForDeal(deal);
  const now = new Date();

  try {
    const invoice = await Invoice.findOneAndUpdate(
      { dealId: deal._id },
      {
        $setOnInsert: {
          saleId: sale._id,
          dealId: deal._id,
          customerId: deal.customerId,
          ownerId: deal.ownerId,
          branchId: deal.branchId,
          amount: deal.total,
          status: 'pending',
          externalId: null,
          idempotencyKey: randomUUID(),
          lastSequence: 0,
          lastSyncedAt: null,
          pushState: 'queued',
          pushAttempts: 0,
          nextAttemptAt: now,
          lockedUntil: null,
          lastError: null,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).exec();

    if (!invoice) {
      throw new ApiError(
        500,
        'INTERNAL_ERROR',
        'Failed to create invoice',
      );
    }

    if (invoice.pushState === 'queued' && !invoice.nextAttemptAt) {
      invoice.nextAttemptAt = now;
      await invoice.save();
    }

    return invoice;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await Invoice.findOne({
        dealId: deal._id,
      }).exec();

      if (existing) {
        if (
          existing.pushState === 'queued' &&
          !existing.nextAttemptAt
        ) {
          existing.nextAttemptAt = now;
          await existing.save();
        }

        return existing;
      }
    }

    throw error;
  }
}

export async function convertDealToInvoice(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
) {
  const deal = await getDeal(dealId, user, scope);

  if (deal.status !== 'won') {
    throw new ApiError(
      409,
      'CONFLICT',
      'Deal must be won before conversion',
    );
  }

  const invoice = await upsertInvoiceForDeal(deal);

  await applyLedgerEntry({
    customerId: deal.customerId,
    invoiceId: invoice._id,
    kind: 'receivable',
    amount: invoice.amount,
  });

  await Deal.updateOne(
    { _id: deal._id },
    { $set: { convertedAt: new Date() } },
  ).exec();

  return invoice;
}

async function findInvoiceForScope(
  invoiceId: string,
  user: ScopeUser,
  scope: Scope,
) {
  if (!isObjectIdString(invoiceId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Invoice not found');
  }

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    ...invoiceScopeFilter<InvoiceAttrs>(user, scope),
  }).exec();

  if (!invoice) {
    throw new ApiError(404, 'NOT_FOUND', 'Invoice not found');
  }

  return invoice;
}

export interface InvoiceListFilters {
  status?: InvoiceStatus;
  pushState?: InvoicePushState;
}

export async function listInvoices(
  user: ScopeUser,
  scope: Scope,
  query: Record<string, unknown>,
  filters: InvoiceListFilters = {},
) {
  const { limit, cursor } = parsePagination(query);
  const filter = {
    ...invoiceScopeFilter<InvoiceAttrs>(user, scope),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.pushState ? { pushState: filters.pushState } : {}),
  };

  return paginateQuery<InvoiceAttrs>(Invoice, filter, {
    limit,
    cursor,
    sort: { _id: -1 },
  });
}

export async function getInvoiceById(
  invoiceId: string,
  user: ScopeUser,
  scope: Scope,
) {
  return findInvoiceForScope(invoiceId, user, scope);
}

export async function getInvoiceLog(
  invoiceId: string,
  user: ScopeUser,
  scope: Scope,
  query: Record<string, unknown>,
) {
  const invoice = await findInvoiceForScope(invoiceId, user, scope);
  const { limit, cursor } = parsePagination(query);

  return paginateQuery<IntegrationLogAttrs>(
    IntegrationLog,
    { invoiceId: invoice._id },
    { limit, cursor, sort: { _id: -1 } },
  );
}

export async function retryInvoice(
  invoiceId: string,
  user: ScopeUser,
  scope: Scope,
) {
  const invoice = await findInvoiceForScope(invoiceId, user, scope);

  if (invoice.status === 'cancelled') {
    throw new ApiError(
      409,
      'CONFLICT',
      'Cancelled invoices cannot be retried',
    );
  }

  if (invoice.pushState !== 'failed') {
    throw new ApiError(
      409,
      'CONFLICT',
      'Only failed pushes can be retried',
    );
  }

  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoice._id,
      pushState: 'failed',
      status: { $ne: 'cancelled' },
    },
    {
      $set: {
        pushState: 'queued',
        pushAttempts: 0,
        nextAttemptAt: new Date(),
        lockedUntil: null,
        lastError: null,
      },
    },
    { new: true },
  ).exec();

  if (!updated) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Invoice state changed; retry not possible',
    );
  }

  return updated;
}

export async function cancelInvoice(
  invoiceId: string,
  user: ScopeUser,
  scope: Scope,
) {
  const invoice = await findInvoiceForScope(invoiceId, user, scope);

  if (invoice.status === 'paid') {
    throw new ApiError(
      409,
      'CONFLICT',
      'Paid invoices cannot be cancelled',
    );
  }

  const updated = await Invoice.findOneAndUpdate(
    { _id: invoice._id, status: { $ne: 'paid' } },
    {
      $set: {
        status: 'cancelled',
        nextAttemptAt: null,
        lockedUntil: null,
      },
    },
    { new: true },
  ).exec();

  if (!updated) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Paid invoices cannot be cancelled',
    );
  }

  return updated;
}
