import type { RequestHandler } from 'express';
import * as catalogService from '../services/catalog.service';
import { asyncHandler } from '../utils/asyncHandler';

export const listCustomers: RequestHandler = asyncHandler(
  async (req, res) => {
    res
      .status(200)
      .json(await catalogService.listCustomers(req.query as Record<string, unknown>));
  },
);

export const listProducts: RequestHandler = asyncHandler(
  async (req, res) => {
    res
      .status(200)
      .json(await catalogService.listProducts(req.query as Record<string, unknown>));
  },
);
