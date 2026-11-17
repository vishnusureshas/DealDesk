import type { HydratedDocument } from 'mongoose';
import type { RoleAttrs, Scope } from '../models/Role';
import type { UserAttrs } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<UserAttrs>;
      role?: HydratedDocument<RoleAttrs>;
      scope?: Scope;
    }
  }
}

export {};
