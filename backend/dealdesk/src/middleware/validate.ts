import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError';

export type ValidationSource = 'body' | 'query' | 'params';

export function validate(
  schema: ZodType,
  source: ValidationSource = 'body',
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => {
          const path = issue.path.map(String).join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');

      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        message || 'Invalid request',
      );
    }

    (req as unknown as Record<ValidationSource, unknown>)[source] =
      result.data;
    next();
  };
}
