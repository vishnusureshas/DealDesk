import type { RequestHandler } from 'express';
import {
  Notification,
  type NotificationAttrs,
} from '../models/Notification';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { isObjectIdString } from '../utils/objectId';
import { parsePagination, paginateQuery } from '../utils/pagination';

function getUser(req: Parameters<RequestHandler>[0]) {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  }

  return req.user;
}

export const listNotifications: RequestHandler = asyncHandler(
  async (req, res) => {
    const user = getUser(req);
    const { limit, cursor } = parsePagination(
      req.query as Record<string, unknown>,
    );
    const result = await paginateQuery<NotificationAttrs>(
      Notification,
      { userId: user._id },
      { limit, cursor, sort: { _id: -1 } },
    );

    res.status(200).json(result);
  },
);

export const markNotificationRead: RequestHandler = asyncHandler(
  async (req, res) => {
    const user = getUser(req);

    if (!isObjectIdString(req.params.id)) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'Notification not found',
      );
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: user._id,
      },
      { $set: { readAt: new Date() } },
      { new: true },
    ).exec();

    if (!notification) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'Notification not found',
      );
    }

    res.status(200).json(notification);
  },
);
