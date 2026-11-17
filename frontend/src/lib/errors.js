import { ApiError } from '../api/client';

export function errorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session expired. Please sign in again.';
    if (error.status === 404) return error.message || 'Not found.';
    return error.message || 'Something went wrong.';
  }
  if (error instanceof TypeError) {
    return 'Cannot reach the DealDesk API. Is it running on :4000?';
  }
  return error?.message || 'Something went wrong.';
}

export function isUnauthorized(error) {
  return error instanceof ApiError && error.status === 401;
}
