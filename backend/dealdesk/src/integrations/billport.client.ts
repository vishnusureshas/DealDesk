import type { HydratedDocument } from 'mongoose';
import axios from 'axios';
import { env } from '../config/env';
import { Customer } from '../models/Customer';
import { Deal } from '../models/Deal';
import type { InvoiceAttrs } from '../models/Invoice';
import { Product } from '../models/Product';
import { ApiError } from '../utils/ApiError';
import { sign } from '../utils/hmac';

export interface BillPortPushResult {
  httpStatus: number | null;
  externalId?: string;
  durationMs: number;
  error?: string;
  request: Record<string, unknown>;
  response: Record<string, unknown> | null;
}

export interface BillPortStatusResult {
  httpStatus: number | null;
  status?: string;
  durationMs: number;
  error?: string;
  response: Record<string, unknown> | null;
}

function extractExternalId(value: unknown): string | undefined {
  if (
    typeof value === 'object' &&
    value !== null &&
    'externalId' in value
  ) {
    const externalId = (value as { externalId?: unknown }).externalId;

    if (typeof externalId === 'string' && externalId.length > 0) {
      return externalId;
    }
  }

  return undefined;
}

function extractStatus(value: unknown): string | undefined {
  if (
    typeof value === 'object' &&
    value !== null &&
    'status' in value
  ) {
    const status = (value as { status?: unknown }).status;

    if (typeof status === 'string' && status.length > 0) {
      return status;
    }
  }

  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return { value };
}

function describeError(
  value: unknown,
  httpStatus: number,
): string | undefined {
  if (httpStatus >= 200 && httpStatus < 300) {
    return undefined;
  }

  if (typeof value === 'object' && value !== null && 'error' in value) {
    const error = (value as { error?: unknown }).error;

    if (typeof error === 'string' && error.length > 0) {
      return error;
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error
    ) {
      const message = (error as { message?: unknown }).message;

      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
  }

  return `BillPort responded with HTTP ${httpStatus}`;
}

export async function pushInvoice(
  invoice: HydratedDocument<InvoiceAttrs>,
): Promise<BillPortPushResult> {
  const [customer, deal] = await Promise.all([
    Customer.findById(invoice.customerId).exec(),
    Deal.findById(invoice.dealId).exec(),
  ]);

  if (!customer || !deal) {
    throw new ApiError(
      500,
      'INTERNAL_ERROR',
      'Invoice references a missing customer or deal',
    );
  }

  const productIds = [
    ...new Set(deal.items.map((item) => item.productId.toString())),
  ];
  const products = await Product.find({
    _id: { $in: productIds },
  }).exec();
  const productsById = new Map(
    products.map((product) => [product._id.toString(), product]),
  );

  const body: Record<string, unknown> = {
    reference: invoice._id.toString(),
    customer: {
      id: invoice.customerId.toString(),
      name: customer.name,
    },
    amount: invoice.amount,
    currency: 'USD',
    lineItems: deal.items.map((item) => {
      const product = productsById.get(item.productId.toString());

      return {
        productId: item.productId.toString(),
        name: product?.name ?? 'Unknown product',
        sku: product?.sku ?? '',
        qty: item.qty,
        price: item.price,
      };
    }),
    issuedAt: invoice._id.getTimestamp().toISOString(),
  };

  const raw = JSON.stringify(body);
  const startedAt = Date.now();

  try {
    const response = await axios.post(
      `${env.BILLPORT_URL}/billing/invoices`,
      raw,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': invoice.idempotencyKey,
          'X-Signature': sign(raw),
        },
        timeout: env.PUSH_TIMEOUT_MS,
        transformRequest: [(data: string) => data],
        validateStatus: () => true,
      },
    );
    const durationMs = Date.now() - startedAt;
    const externalId = extractExternalId(response.data);
    const missingExternalId =
      response.status >= 200 &&
      response.status < 300 &&
      !externalId
        ? 'BillPort response missing externalId'
        : undefined;
    const error =
      missingExternalId ??
      describeError(response.data, response.status);

    return {
      httpStatus: response.status,
      ...(externalId ? { externalId } : {}),
      durationMs,
      ...(error ? { error } : {}),
      request: body,
      response: toRecord(response.data),
    };
  } catch (error) {
    return {
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      error:
        error instanceof Error
          ? error.message
          : 'BillPort request failed',
      request: body,
      response: null,
    };
  }
}

export async function getInvoiceStatus(
  externalId: string,
): Promise<BillPortStatusResult> {
  const startedAt = Date.now();

  try {
    const response = await axios.get(
      `${env.BILLPORT_URL}/billing/invoices/${encodeURIComponent(externalId)}`,
      {
        timeout: env.PUSH_TIMEOUT_MS,
        validateStatus: () => true,
      },
    );
    const status = extractStatus(response.data);
    const error = describeError(response.data, response.status);

    return {
      httpStatus: response.status,
      ...(status ? { status } : {}),
      durationMs: Date.now() - startedAt,
      ...(error ? { error } : {}),
      response: toRecord(response.data),
    };
  } catch (error) {
    return {
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      error:
        error instanceof Error
          ? error.message
          : 'BillPort request failed',
      response: null,
    };
  }
}
