import express, { Router } from 'express';
import { handleBillPortWebhook } from '../controllers/webhooks.controller';

const router = Router();

router.post(
  '/billport',
  express.raw({ type: '*/*', limit: '100kb' }),
  handleBillPortWebhook,
);

export default router;
