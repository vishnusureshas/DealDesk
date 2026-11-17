import { ApiError } from './ApiError';

export function assertIntegerMinorUnits(
  value: number,
  field = 'amount',
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `${field} must be a non-negative integer in minor units`,
    );
  }
}

export function computeTotal(
  subtotal: number,
  discountPct: number,
): number {
  assertIntegerMinorUnits(subtotal, 'subtotal');

  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'discountPct must be between 0 and 100',
    );
  }

  return Math.round((subtotal * (100 - discountPct)) / 100);
}
