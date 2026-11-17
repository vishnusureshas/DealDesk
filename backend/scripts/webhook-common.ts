import path from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, '../dealdesk/.env'),
});
dotenv.config();

const secret = process.env.BILLPORT_SHARED_SECRET;

if (!secret) {
  throw new Error('BILLPORT_SHARED_SECRET is required');
}

export const dealdeskUrl = (
  process.env.DEALDESK_URL ?? 'http://localhost:4000'
).replace(/\/+$/, '');

export function signWebhook(rawBody: string): string {
  return createHmac('sha256', secret as string)
    .update(rawBody)
    .digest('hex');
}

export interface DemoWebhookBody {
  eventId: string;
  externalId: string;
  status: 'QUEUED' | 'SENT' | 'VIEWED' | 'PAID' | 'FAILED';
  sequence: number;
  occurredAt: string;
}

export function createWebhookBody(
  status: DemoWebhookBody['status'],
  sequence: number,
  options: {
    eventId?: string;
    externalId?: string;
  } = {},
): DemoWebhookBody {
  return {
    eventId: options.eventId ?? randomUUID(),
    externalId:
      options.externalId ??
      process.env.EXTERNAL_ID ??
      'ext_demo',
    status,
    sequence,
    occurredAt: new Date().toISOString(),
  };
}

export async function postWebhook(
  body: DemoWebhookBody,
  options: { tampered?: boolean } = {},
): Promise<{ status: number; body: unknown }> {
  const raw = JSON.stringify(body);
  let signature = signWebhook(raw);

  if (options.tampered) {
    const last = signature.endsWith('0') ? '1' : '0';
    signature = `${signature.slice(0, -1)}${last}`;
  }

  const response = await fetch(`${dealdeskUrl}/webhooks/billport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body: raw,
  });
  const text = await response.text();
  let parsed: unknown = text;

  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  console.log(
    JSON.stringify(
      {
        status: response.status,
        body: parsed,
        eventId: body.eventId,
        externalId: body.externalId,
        webhookStatus: body.status,
        sequence: body.sequence,
        tampered: options.tampered ?? false,
      },
      null,
      2,
    ),
  );

  return { status: response.status, body: parsed };
}
