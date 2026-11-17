import { z } from 'zod';

export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

export const objectIdSchema = z
  .string()
  .regex(OBJECT_ID_PATTERN, 'Invalid ObjectId');
