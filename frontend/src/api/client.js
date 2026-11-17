import { getToken } from '../lib/token';

const BASE_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:4000'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildQuery(query) {
  if (!query) return '';

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });

  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

export async function request(path, { method = 'GET', body, query, signal } = {}) {
  const token = getToken();
  const headers = { Accept: 'application/json' };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;

  try {
    response = await fetch(`${BASE_URL}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new TypeError('Network request failed');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    // A 401 on an unauthenticated call (e.g. a bad login) is not an expired
    // session; only redirect when a token was actually sent.
    if (response.status === 401 && token) {
      window.dispatchEvent(new CustomEvent('dealdesk:unauthorized'));
    }

    const error = payload?.error ?? {};
    throw new ApiError(
      response.status,
      error.code || 'HTTP_ERROR',
      error.message || `Request failed with status ${response.status}`,
      payload?.details,
    );
  }

  return payload;
}
