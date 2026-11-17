import { describe, expect, it } from 'vitest';
import {
  dealScopeFilter,
  discountRequestScopeFilter,
  getScope,
  invoiceScopeFilter,
  scopeFilter,
} from '../dealdesk/src/utils/scope';

const userId = '507f1f77bcf86cd799439011';
const branchId = '507f1f77bcf86cd799439012';
const user = { _id: userId, branchId };

const role = {
  permissions: [
    { key: 'deal.view' as const, scope: 'branch' as const },
    { key: 'deal.edit' as const, scope: 'own' as const },
  ],
};

describe('scope helpers', () => {
  it('builds owner-based filters for deals and invoices', () => {
    expect(scopeFilter(user, 'own')).toEqual({ ownerId: userId });
    expect(dealScopeFilter(user, 'own')).toEqual({ ownerId: userId });
    expect(invoiceScopeFilter(user, 'own')).toEqual({ ownerId: userId });
    expect(dealScopeFilter(user, 'branch')).toEqual({ branchId });
    expect(invoiceScopeFilter(user, 'branch')).toEqual({ branchId });
    expect(dealScopeFilter(user, 'all')).toEqual({});
    expect(invoiceScopeFilter(user, 'all')).toEqual({});
  });

  it('builds requester-based filters for discount requests', () => {
    expect(discountRequestScopeFilter(user, 'own')).toEqual({
      requestedBy: userId,
    });
    expect(discountRequestScopeFilter(user, 'branch')).toEqual({ branchId });
    expect(discountRequestScopeFilter(user, 'all')).toEqual({});
  });

  it('reads scope from the matching permission only', () => {
    expect(getScope(role, 'deal.view')).toBe('branch');
    expect(getScope(role, 'deal.edit')).toBe('own');
    expect(getScope(role, 'admin.manage')).toBeNull();
  });
});
