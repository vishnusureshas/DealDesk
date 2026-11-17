import type { HydratedDocument } from 'mongoose';
import type { DefaultEventsMap, Server } from 'socket.io';
import type { RoleAttrs } from '../models/Role';
import type { UserAttrs } from '../models/User';
import { loadSessionFromToken } from '../services/auth.service';

export interface AuthenticatedSocketData {
  user?: HydratedDocument<UserAttrs>;
  role?: HydratedDocument<RoleAttrs>;
}

export type DealDeskSocketServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  AuthenticatedSocketData
>;

export function registerSocketAuth(io: DealDeskSocketServer): void {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }

    try {
      const { user, role } = await loadSessionFromToken(token);
      socket.data.user = user;
      socket.data.role = role;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });
}
