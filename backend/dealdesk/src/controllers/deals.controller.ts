import type { RequestHandler } from 'express';
import type { DealStatus } from '../models/Deal';
import * as approvalService from '../services/approval.service';
import * as dealService from '../services/deal.service';
import { convertDealToInvoice } from '../services/invoice.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

function getScopedContext(req: Parameters<RequestHandler>[0]) {
  if (!req.user || !req.scope) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  }

  return { user: req.user, scope: req.scope };
}

export const listDeals: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const { status } = req.query as { status?: DealStatus };
    const result = await dealService.listDeals(
      user,
      scope,
      req.query as Record<string, unknown>,
      status,
    );

    res.status(200).json(result);
  },
);

export const createDeal: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
    }

    const deal = await dealService.createDeal(
      req.user,
      req.body as dealService.CreateDealInput,
    );

    res.status(201).json(deal);
  },
);

export const getDeal: RequestHandler = asyncHandler(async (req, res) => {
  const { user, scope } = getScopedContext(req);
  const deal = await dealService.getDeal(
    req.params.id,
    user,
    scope,
  );

  res.status(200).json(deal);
});

export const listDealDiscountRequests: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const items = await approvalService.listDealDiscountRequests(
      req.params.id,
      user,
      scope,
    );

    res.status(200).json({ items });
  },
);

export const updateDeal: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const deal = await dealService.updateDeal(
      req.params.id,
      user,
      scope,
      req.body as dealService.UpdateDealInput,
    );

    res.status(200).json(deal);
  },
);

export const convertDeal: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, scope } = getScopedContext(req);
    const invoice = await convertDealToInvoice(
      req.params.id,
      user,
      scope,
    );

    res.status(200).json({ invoice });
  },
);
