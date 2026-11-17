import { describe, expect, it } from 'vitest';
import { findBandForPct, sortBands, validateBands } from './approvalBands';

const rolesByKey = new Map([
  ['manager', { key: 'manager' }],
  ['finance', { key: 'finance' }],
  ['exec', { key: 'exec' }],
]);
const approverKeys = new Set(['manager', 'finance']);

const validBands = [
  { minPct: 0, maxPct: 10, chain: [] },
  { minPct: 10, maxPct: 100, chain: ['manager', 'finance'] },
];

describe('validateBands', () => {
  it('accepts a contiguous config that starts at 0 and ends at 100', () => {
    expect(validateBands(validBands, rolesByKey, approverKeys).errors).toEqual(
      [],
    );
  });

  it('sorts bands before validating without mutating the input', () => {
    const input = [
      { minPct: 10, maxPct: 100, chain: ['manager'] },
      { minPct: 0, maxPct: 10, chain: [] },
    ];
    const snapshot = JSON.stringify(input);

    const { errors, parsed } = validateBands(input, rolesByKey, approverKeys);

    expect(errors).toEqual([]);
    expect(parsed.map((band) => band.minPct)).toEqual([0, 10]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('requires at least one band', () => {
    const { errors } = validateBands([], rolesByKey, approverKeys);
    expect(errors).toContain('At least one approval band is required.');
  });

  it('rejects gaps and overlaps', () => {
    const gap = validateBands(
      [
        { minPct: 0, maxPct: 10, chain: [] },
        { minPct: 20, maxPct: 100, chain: [] },
      ],
      rolesByKey,
      approverKeys,
    );

    expect(gap.errors.some((error) => error.includes('contiguous'))).toBe(true);
  });

  it('requires the range to start at 0 and end at 100', () => {
    const start = validateBands(
      [{ minPct: 5, maxPct: 100, chain: [] }],
      rolesByKey,
      approverKeys,
    );
    const end = validateBands(
      [{ minPct: 0, maxPct: 90, chain: [] }],
      rolesByKey,
      approverKeys,
    );

    expect(start.errors).toContain('Bands must start at 0%.');
    expect(end.errors).toContain('Bands must end at 100%.');
  });

  it('requires min < max and bounds inside 0..100', () => {
    const { errors } = validateBands(
      [{ minPct: 0, maxPct: 100, chain: [] }],
      rolesByKey,
      approverKeys,
    );

    expect(errors).toEqual([]);

    const equal = validateBands(
      [{ minPct: 0, maxPct: 0, chain: [] }],
      rolesByKey,
      approverKeys,
    );

    expect(equal.errors.some((error) => error.includes('min % must be lower'))).toBe(
      true,
    );
  });

  it('rejects unknown and non-approver roles in a chain', () => {
    const unknown = validateBands(
      [{ minPct: 0, maxPct: 100, chain: ['ghost'] }],
      rolesByKey,
      approverKeys,
    );
    const nonApprover = validateBands(
      [{ minPct: 0, maxPct: 100, chain: ['exec'] }],
      rolesByKey,
      approverKeys,
    );

    expect(unknown.errors.some((error) => error.includes('unknown role'))).toBe(
      true,
    );
    expect(
      nonApprover.errors.some((error) => error.includes('cannot approve')),
    ).toBe(true);
  });
});

describe('findBandForPct', () => {
  it('mirrors the server rule minPct < pct <= maxPct', () => {
    expect(findBandForPct(validBands, 5)).toEqual(validBands[0]);
    expect(findBandForPct(validBands, 10)).toEqual(validBands[0]);
    expect(findBandForPct(validBands, 30)).toEqual({
      minPct: 10,
      maxPct: 100,
      chain: ['manager', 'finance'],
    });
    expect(findBandForPct(validBands, 100)).toEqual({
      minPct: 10,
      maxPct: 100,
      chain: ['manager', 'finance'],
    });
  });

  it('returns null for 0% (auto-approved) and out-of-range values', () => {
    expect(findBandForPct(validBands, 0)).toBeNull();
    expect(findBandForPct(validBands, -5)).toBeNull();
    expect(findBandForPct(validBands, 101)).toBeNull();
    expect(findBandForPct(validBands, 'abc')).toBeNull();
  });
});

describe('sortBands', () => {
  it('defaults a missing chain to an empty array', () => {
    expect(sortBands([{ minPct: 0, maxPct: 100 }])).toEqual([
      { minPct: 0, maxPct: 100, chain: [] },
    ]);
  });
});
