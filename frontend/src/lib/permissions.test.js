import { describe, expect, it } from 'vitest';
import { canAny, hasPermission, permissionFor, SCOPE_LABEL } from './permissions';

const user = {
  role: {
    key: 'account_exec',
    permissions: [
      { key: 'deal.view', scope: 'branch' },
      { key: 'deal.edit', scope: 'own' },
    ],
  },
};

describe('permissionFor', () => {
  it('finds a permission by key', () => {
    expect(permissionFor(user, 'deal.view')).toEqual({
      key: 'deal.view',
      scope: 'branch',
    });
    expect(permissionFor(user, 'invoice.issue')).toBeNull();
    expect(permissionFor(null, 'deal.view')).toBeNull();
  });
});

describe('hasPermission', () => {
  it('returns true for any granted key and false for missing keys', () => {
    expect(hasPermission(user, 'deal.view')).toBe(true);
    expect(hasPermission(user, 'admin.manage')).toBe(false);
    expect(hasPermission(null, 'deal.view')).toBe(false);
    expect(hasPermission(undefined, 'deal.view')).toBe(false);
  });

  it('matches the optional scope exactly', () => {
    expect(hasPermission(user, 'deal.view', 'branch')).toBe(true);
    expect(hasPermission(user, 'deal.view', 'own')).toBe(false);
    expect(hasPermission(user, 'deal.view', 'all')).toBe(false);
  });
});

describe('canAny', () => {
  it('is true when at least one key is granted', () => {
    expect(canAny(user, ['admin.manage', 'deal.edit'])).toBe(true);
    expect(canAny(user, ['admin.manage', 'invoice.issue'])).toBe(false);
    expect(canAny(user, [])).toBe(false);
  });
});

describe('SCOPE_LABEL', () => {
  it('documents every scope', () => {
    expect(Object.keys(SCOPE_LABEL).sort()).toEqual(['all', 'branch', 'own']);
  });
});
