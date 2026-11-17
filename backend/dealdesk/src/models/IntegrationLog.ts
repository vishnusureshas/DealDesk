import mongoose, { Schema, Types } from 'mongoose';

export const INTEGRATION_LOG_DIRECTIONS = ['outbound', 'inbound'] as const;
export type IntegrationLogDirection =
  (typeof INTEGRATION_LOG_DIRECTIONS)[number];

export const INTEGRATION_LOG_OUTCOMES = [
  'push_attempt',
  'retry_scheduled',
  'push_succeeded',
  'push_failed_terminal',
  'bad_signature',
  'bad_payload',
  'duplicate_ignored',
  'stale_ignored',
  'orphan_parked',
  'applied',
  'reconciled',
  'balance_repaired',
] as const;
export type IntegrationLogOutcome =
  (typeof INTEGRATION_LOG_OUTCOMES)[number];

export interface IntegrationLogAttrs {
  direction: IntegrationLogDirection;
  invoiceId: Types.ObjectId | null;
  externalId: string | null;
  eventId: string | null;
  attempt: number | null;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  httpStatus: number | null;
  outcome: IntegrationLogOutcome;
  durationMs: number | null;
  at: Date;
}

const integrationLogSchema = new Schema<IntegrationLogAttrs>(
  {
    direction: {
      type: String,
      required: true,
      enum: [...INTEGRATION_LOG_DIRECTIONS],
    },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    externalId: { type: String, default: null },
    eventId: { type: String, default: null },
    attempt: { type: Number, default: null, min: 0 },
    request: { type: Schema.Types.Mixed, default: null },
    response: { type: Schema.Types.Mixed, default: null },
    httpStatus: { type: Number, default: null },
    outcome: {
      type: String,
      required: true,
      enum: [...INTEGRATION_LOG_OUTCOMES],
    },
    durationMs: { type: Number, default: null, min: 0 },
    at: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

integrationLogSchema.index({ invoiceId: 1, at: 1 });

export const IntegrationLog = mongoose.model<IntegrationLogAttrs>(
  'IntegrationLog',
  integrationLogSchema,
);
