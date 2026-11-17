import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { errorMessage, isUnauthorized } from './errors';

describe('errorMessage', () => {
  it('maps a 401 to a session-expired message', () => {
    expect(
      errorMessage(new ApiError(401, 'UNAUTHENTICATED', 'Invalid token')),
    ).toBe('Your session expired. Please sign in again.');
  });

  it('keeps backend messages for other handled errors', () => {
    expect(
      errorMessage(
        new ApiError(403, 'FORBIDDEN', 'Requesters cannot decide their own request'),
      ),
    ).toBe('Requesters cannot decide their own request');
    expect(
      errorMessage(new ApiError(404, 'NOT_FOUND', 'Deal not found')),
    ).toBe('Deal not found');
    expect(
      errorMessage(new ApiError(409, 'CONFLICT', 'Already decided')),
    ).toBe('Already decided');
  });

  it('falls back to a generic message when the error has none', () => {
    expect(errorMessage(new ApiError(500, 'HTTP_ERROR', ''))).toBe(
      'Something went wrong.',
    );
  });

  it('explains network failures', () => {
    expect(errorMessage(new TypeError('Network request failed'))).toBe(
      'Cannot reach the DealDesk API. Is it running on :4000?',
    );
  });

  it('passes through plain error messages', () => {
    expect(errorMessage(new Error('Boom'))).toBe('Boom');
    expect(errorMessage(null)).toBe('Something went wrong.');
  });
});

describe('isUnauthorized', () => {
  it('only flags 401 ApiErrors', () => {
    expect(isUnauthorized(new ApiError(401, 'UNAUTHENTICATED', 'x'))).toBe(true);
    expect(isUnauthorized(new ApiError(403, 'FORBIDDEN', 'x'))).toBe(false);
    expect(isUnauthorized(new Error('x'))).toBe(false);
  });
});
