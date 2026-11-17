import type {
  ErrorRequestHandler,
  RequestHandler,
} from 'express';
import { ApiError } from '../utils/ApiError';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
};

export const errorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  const isDuplicateKey =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000;

  if (isDuplicateKey) {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'Duplicate key' },
    });
    return;
  }

  const status =
    typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;

  const message =
    status === 500
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : 'Request failed';

  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'ERROR',
      message,
    },
  });
};
