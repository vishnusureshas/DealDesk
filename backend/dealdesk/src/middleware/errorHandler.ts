import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';

interface DuplicateKeyError {
  code?: unknown;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === 11000 || code === '11000';
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
};

export const errorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const message =
      Object.values(err.errors)
        .map((validationError) => validationError.message)
        .join('; ') || 'Validation failed';

    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message },
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid value for ${err.path}`,
      },
    });
    return;
  }

  if (isDuplicateKeyError(err)) {
    const fields = Object.keys(err.keyValue ?? {});
    const message =
      fields.length > 0
        ? `Duplicate value for ${fields.join(', ')}`
        : 'Duplicate value';

    res.status(409).json({
      error: { code: 'CONFLICT', message },
    });
    return;
  }

  if (
    err instanceof SyntaxError &&
    (err as { status?: number }).status === 400 &&
    'body' in err
  ) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
    });
    return;
  }

  console.error('[dealdesk] Unhandled error', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
};
