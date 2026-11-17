import type { Types } from 'mongoose';
import {
  BalanceEntry,
  type BalanceEntryKind,
} from '../models/BalanceEntry';
import { Customer } from '../models/Customer';

export interface LedgerEntryInput {
  customerId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  kind: BalanceEntryKind;
  amount: number;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function applyLedgerEntry(
  input: LedgerEntryInput,
): Promise<boolean> {
  try {
    await BalanceEntry.create(input);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return false;
    }

    throw error;
  }

  const delta = input.kind === 'receivable' ? input.amount : -input.amount;

  await Customer.updateOne(
    { _id: input.customerId },
    { $inc: { outstandingBalance: delta } },
  ).exec();

  return true;
}
