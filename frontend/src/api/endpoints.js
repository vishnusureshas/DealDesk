import { request } from './client';

export const authApi = {
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => request('/auth/me'),
};

export const dealsApi = {
  list: ({ limit = 20, cursor, status } = {}) =>
    request('/deals', { query: { limit, cursor, status } }),
  create: (body) =>
    request('/deals', { method: 'POST', body }),
  get: (id) => request(`/deals/${id}`),
  update: (id, body) =>
    request(`/deals/${id}`, { method: 'PATCH', body }),
  discountRequests: (id) => request(`/deals/${id}/discount-requests`),
  requestDiscount: (id, pct) =>
    request(`/deals/${id}/discount-requests`, {
      method: 'POST',
      body: { pct },
    }),
  convert: (id) =>
    request(`/deals/${id}/convert`, { method: 'POST' }),
};

export const approvalsApi = {
  pending: ({ limit = 20, cursor } = {}) =>
    request('/approvals/pending', { query: { limit, cursor } }),
  get: (id) => request(`/approvals/${id}`),
  decide: (id, decision) =>
    request(`/approvals/${id}/decide`, { method: 'POST', body: decision }),
};

export const invoicesApi = {
  list: ({ limit = 20, cursor, status, pushState } = {}) =>
    request('/invoices', { query: { limit, cursor, status, pushState } }),
  get: (id) => request(`/invoices/${id}`),
  log: (id, { limit = 20, cursor } = {}) =>
    request(`/invoices/${id}/log`, { query: { limit, cursor } }),
  retry: (id) => request(`/invoices/${id}/retry`, { method: 'POST' }),
  cancel: (id) => request(`/invoices/${id}/cancel`, { method: 'POST' }),
};

export const adminApi = {
  permissions: () => request('/permissions'),
  roles: () => request('/roles'),
  createRole: (body) => request('/roles', { method: 'POST', body }),
  updateRole: (id, body) =>
    request(`/roles/${id}`, { method: 'PATCH', body }),
  getConfig: () => request('/approval-config'),
  saveConfig: (bands) =>
    request('/approval-config', { method: 'PUT', body: { bands } }),
};

export const chatApi = {
  threads: ({ limit = 20, cursor } = {}) =>
    request('/threads', { query: { limit, cursor } }),
  messages: (threadId, { limit = 20, cursor } = {}) =>
    request(`/threads/${threadId}/messages`, { query: { limit, cursor } }),
  send: (threadId, { body, clientId }) =>
    request(`/threads/${threadId}/messages`, {
      method: 'POST',
      body: { body, clientId },
    }),
  read: (threadId) =>
    request(`/threads/${threadId}/read`, { method: 'POST' }),
};

export const catalogApi = {
  customers: ({ limit = 100, cursor } = {}) =>
    request('/customers', { query: { limit, cursor } }),
  products: ({ limit = 100, cursor } = {}) =>
    request('/products', { query: { limit, cursor } }),
};

export const notificationsApi = {
  list: ({ limit = 20, cursor } = {}) =>
    request('/notifications', { query: { limit, cursor } }),
  markRead: (id) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),
};
