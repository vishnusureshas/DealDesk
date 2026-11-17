export const SCOPES = ['own', 'branch', 'all'] as const;
export type Scope = (typeof SCOPES)[number];

export const PERMISSION_KEYS = [
  'deal.view',
  'deal.edit',
  'discount.approve',
  'invoice.issue',
  'invoice.cancel',
  'chat.send',
  'admin.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export interface PermissionDefinition {
  key: PermissionKey;
  description: string;
  allowedScopes: readonly Scope[];
}

export const PERMISSION_DEFINITIONS = {
  'deal.view': {
    description: 'Read deals',
    allowedScopes: SCOPES,
  },
  'deal.edit': {
    description: 'Create and edit deals',
    allowedScopes: SCOPES,
  },
  'discount.approve': {
    description: 'Approve discounts',
    allowedScopes: ['branch', 'all'],
  },
  'invoice.issue': {
    description: 'Create invoices',
    allowedScopes: ['all'],
  },
  'invoice.cancel': {
    description: 'Cancel invoices',
    allowedScopes: ['all'],
  },
  'chat.send': {
    description: 'Send chat messages',
    allowedScopes: ['all'],
  },
  'admin.manage': {
    description: 'Manage roles, permissions and approval config',
    allowedScopes: ['all'],
  },
} as const satisfies Record<
  PermissionKey,
  { description: string; allowedScopes: readonly Scope[] }
>;

export const PERMISSION_CATALOG: readonly PermissionDefinition[] =
  PERMISSION_KEYS.map((key) => ({
    key,
    ...PERMISSION_DEFINITIONS[key],
  }));
