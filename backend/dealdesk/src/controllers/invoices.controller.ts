import type { RequestHandler } from 'express';
import type {
  InvoicePushState,
  InvoiceStatus,
} from '../models/Invoice';
import * as invoiceService from '../services/invoice.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

function getScopedContext(req: Parameters<RequestHandler>[0]) {
  if (!req.user || !req.scope) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  }

  return { user: req.user, scope: req.scope };
}

export const listInvoices: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const { status, pushState } = req.query as {
      status?: InvoiceStatus;
      pushState?: InvoicePushState;
    };
    const result = await invoiceService.listInvoices(
      user,
      scope,
      req.query as Record<string, unknown>,
      { status, pushState },
    );

    res.status(200).json(result);
  },
);

export const getInvoice: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const invoice = await invoiceService.getInvoiceById(
      req.params.id,
      user,
      scope,
    );

    res.status(200).json(invoice);
  },
);

export const getInvoiceLog: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const result = await invoiceService.getInvoiceLog(
      req.params.id,
      user,
      scope,
      req.query as Record<string, unknown>,
    );

    res.status(200).json(result);
  },
);

export const retryInvoice: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const invoice = await invoiceService.retryInvoice(
      req.params.id,
      user,
      scope,
    );

    res.status(200).json(invoice);
  },
);

export const cancelInvoice: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const invoice = await invoiceService.cancelInvoice(
      req.params.id,
      user,
      scope,
    );

    res.status(200).json(invoice);
  },
);
