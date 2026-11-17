import { describe, expect, it } from 'vitest';
import { centsToInput, expectedTotal, formatCents, toCents } from './money';

describe('formatCents', () => {
  it('formats integer minor units as USD', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(1234)).toBe('$12.34');
    expect(formatCents(123456)).toBe('$1,234.56');
  });

  it('renders unknown values as a dash', () => {
    expect(formatCents(null)).toBe('—');
    expect(formatCents(undefined)).toBe('—');
    expect(formatCents('not-a-number')).toBe('—');
  });
});

describe('toCents', () => {
  it('rounds decimal input to integer cents', () => {
    expect(toCents('12.34')).toBe(1234);
    expect(toCents('0')).toBe(0);
    expect(toCents('$1,234.56')).toBe(123456);
    expect(toCents('  10.5  ')).toBe(1050);
  });

  it('rejects empty and non-numeric input', () => {
    expect(toCents('')).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents('abc')).toBeNull();
  });

  it('rejects negative input instead of dropping the sign', () => {
    expect(toCents('-5')).toBeNull();
    expect(toCents('$-5.00')).toBeNull();
  });
});

describe('centsToInput', () => {
  it('renders cents as a two-decimal input value', () => {
    expect(centsToInput(1234)).toBe('12.34');
    expect(centsToInput(0)).toBe('0.00');
    expect(centsToInput(null)).toBe('0.00');
  });
});

describe('expectedTotal', () => {
  it('mirrors the backend computeTotal rounding once', () => {
    expect(expectedTotal(10000, 30)).toBe(7000);
    expect(expectedTotal(999, 10)).toBe(899);
    expect(expectedTotal(100, 0)).toBe(100);
    expect(expectedTotal(100, 100)).toBe(0);
  });
});
