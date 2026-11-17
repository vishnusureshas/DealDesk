import type { RequestHandler } from 'express';
import * as chatService from '../services/chat.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { getScope } from '../utils/scope';

function getChatContext(req: Parameters<RequestHandler>[0]) {
  if (!req.user || !req.role) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  }

  const dealScope = getScope(req.role, 'deal.view');

  if (!dealScope) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Missing permission: deal.view',
    );
  }

  return { user: req.user, dealScope };
}

export const listThreads: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, dealScope } = getChatContext(req);
    const result = await chatService.listThreads(
      user,
      dealScope,
      req.query as Record<string, unknown>,
    );

    res.status(200).json(result);
  },
);

export const listThreadMessages: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, dealScope } = getChatContext(req);
    const result = await chatService.listThreadMessages(
      req.params.id,
      user,
      dealScope,
      req.query as Record<string, unknown>,
    );

    res.status(200).json(result);
  },
);

export const sendThreadMessage: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, dealScope } = getChatContext(req);
    const result = await chatService.sendThreadMessage(
      req.params.id,
      user,
      dealScope,
      req.body as chatService.ChatMessageInput,
    );

    res.status(201).json({ message: result.message });
  },
);

export const markThreadRead: RequestHandler = asyncHandler(
  async (req, res) => {
    const { user, dealScope } = getChatContext(req);
    const result = await chatService.markThreadRead(
      req.params.id,
      user,
      dealScope,
    );

    res.status(200).json({
      ok: true,
      lastReadAt: result.lastReadAt,
    });
  },
);
