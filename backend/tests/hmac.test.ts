import { describe, expect, it } from 'vitest';
import { sign, verify } from '../dealdesk/src/utils/hmac';

const body = JSON.stringify({ eventId: 'evt_1', status: 'PAID' });

describe('HMAC helpers', () => {
  it('verifies a matching signature', () => {
    const signature = sign(body);

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verify(body, signature)).toBe(true);
    expect(verify(body, signature.toUpperCase())).toBe(true);
  });

  it('rejects a same-length wrong signature', () => {
    const signature = sign(body);
    const replacement = signature.endsWith('0') ? '1' : '0';
    const wrong = `${signature.slice(0, -1)}${replacement}`;

    expect(wrong).toHaveLength(signature.length);
    expect(wrong).not.toBe(signature);
    expect(verify(body, wrong)).toBe(false);
  });

  it('rejects a mismatched-length signature', () => {
    const signature = sign(body);

    expect(verify(body, signature.slice(0, -1))).toBe(false);
    expect(verify(body, `${signature}0`)).toBe(false);
  });

  it('rejects missing, non-hex and tampered signatures', () => {
    const signature = sign(body);

    expect(verify(body, undefined)).toBe(false);
    expect(verify(body, 'g'.repeat(64))).toBe(false);
    expect(verify(`${body} `, signature)).toBe(false);
  });
});
