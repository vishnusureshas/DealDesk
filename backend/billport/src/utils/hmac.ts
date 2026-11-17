import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

const HEX_SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;

export function sign(
  rawBody: string | Buffer,
  secret: string = env.BILLPORT_SHARED_SECRET,
): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verify(
  rawBody: string | Buffer,
  header: string | undefined | null,
): boolean {
  if (
    typeof header !== 'string' ||
    !HEX_SIGNATURE_PATTERN.test(header)
  ) {
    return false;
  }

  const expected = Buffer.from(sign(rawBody), 'hex');
  const provided = Buffer.from(header, 'hex');

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}
