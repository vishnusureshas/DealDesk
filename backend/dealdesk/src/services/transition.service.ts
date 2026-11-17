import type { HydratedDocument } from 'mongoose';
import { emitDomainEvent } from '../events/bus';
import {
  Invoice,
  type InvoiceAttrs,
  type InvoiceStatus,
} from '../models/Invoice';
import type { WebhookEventStatus } from '../models/WebhookEvent';
import { applyLedgerEntry } from './balance.service';

const STATUS_MAP: Record<WebhookEventStatus, InvoiceStatus> = {
  QUEUED: 'pending',
  SENT: 'sent',
  VIEWED: 'viewed',
  PAID: 'paid',
  FAILED: 'failed',
};

export interface ExternalStatusResult {
  applied: boolean;
  from: InvoiceStatus;
  to: InvoiceStatus;
  invoice: HydratedDocument<InvoiceAttrs> | null;
}

export async function applyExternalStatus(
  invoice: HydratedDocument<InvoiceAttrs>,
  externalStatus: WebhookEventStatus,
  sequence: number,
  source: 'webhook' | 'reconcile' = 'webhook',
  eventId: string | null = null,
): Promise<ExternalStatusResult> {
  const to = STATUS_MAP[externalStatus];
  const now = new Date();

  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoice._id,
      status: { $nin: ['cancelled', 'paid', 'failed'] },
      lastSequence: { $lt: sequence },
    },
    {
      $set: {
        status: to,
        lastSequence: sequence,
        lastSyncedAt: now,
      },
    },
    { new: true },
  ).exec();

  if (!updated) {
    return {
      applied: false,
      from: invoice.status,
      to,
      invoice: null,
    };
  }

  emitDomainEvent('invoice.status_changed', {
    invoiceId: updated._id,
    dealId: updated.dealId,
    ownerId: updated.ownerId,
    from: invoice.status,
    to: updated.status,
  });

  if (updated.status === 'paid') {
    await applyLedgerEntry({
      customerId: updated.customerId,
      invoiceId: updated._id,
      kind: 'payment',
      amount: updated.amount,
    });
  }

  return {
    applied: true,
    from: invoice.status,
    to: updated.status,
    invoice: updated,
  };
}
