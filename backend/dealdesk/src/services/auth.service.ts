import type { HydratedDocument } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { Branch } from '../models/Branch';
import { Role, type RoleAttrs, type RolePermission } from '../models/Role';
import { User, type UserAttrs } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { isObjectIdString } from '../utils/objectId';

const BCRYPT_ROUNDS = 12;

export interface AuthUser {
  id: string;
  email: string;
  role: {
    key: string;
    permissions: RolePermission[];
  };
  branchId: string;
  managerId: string | null;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface CreateUserInput {
  email: string;
  password: string;
  roleId: string;
  branchId: string;
  managerId?: string | null;
}

export interface CreatedUser {
  id: string;
  email: string;
  roleId: string;
  branchId: string;
  managerId: string | null;
}

export interface AuthenticatedSession {
  user: HydratedDocument<UserAttrs>;
  role: HydratedDocument<RoleAttrs>;
}

export async function loadSessionFromToken(
  token: string,
): Promise<AuthenticatedSession> {
  let payload: string | JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Invalid or expired token',
    );
  }

  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    !isObjectIdString(payload.sub)
  ) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Invalid or expired token',
    );
  }

  const user = await User.findById(payload.sub).exec();

  if (!user) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Invalid or expired token',
    );
  }

  const role = await Role.findById(user.roleId).exec();

  if (!role) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Invalid or expired token',
    );
  }

  return { user, role };
}

export function toAuthUser(
  user: HydratedDocument<UserAttrs>,
  role: HydratedDocument<RoleAttrs>,
): AuthUser {
  return {
    id: user._id.toString(),
    email: user.email,
    role: {
      key: role.key,
      permissions: role.permissions.map(({ key, scope }) => ({ key, scope })),
    },
    branchId: user.branchId.toString(),
    managerId: user.managerId ? user.managerId.toString() : null,
  };
}

export async function login(
  email: string,
  password: string,
): Promise<AuthSession> {
  const user = await User.findOne({
    email: email.toLowerCase().trim(),
  })
    .select('+passwordHash')
    .exec();

  if (!user) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Invalid email or password',
    );
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Invalid email or password',
    );
  }

  const role = await Role.findById(user.roleId).exec();

  if (!role) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Invalid email or password',
    );
  }

  const token = jwt.sign({ sub: user._id.toString() }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

  return { token, user: toAuthUser(user, role) };
}

export async function createUser(
  input: CreateUserInput,
): Promise<CreatedUser> {
  const [role, branch] = await Promise.all([
    Role.findById(input.roleId).exec(),
    Branch.findById(input.branchId).exec(),
  ]);

  if (!role) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown roleId');
  }

  if (!branch) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown branchId');
  }

  if (input.managerId) {
    const manager = await User.findById(input.managerId).exec();

    if (!manager) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown managerId');
    }
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await User.create({
    email: input.email.toLowerCase().trim(),
    passwordHash,
    roleId: role._id,
    branchId: branch._id,
    managerId: input.managerId ?? null,
  });

  return {
    id: user._id.toString(),
    email: user.email,
    roleId: user.roleId.toString(),
    branchId: user.branchId.toString(),
    managerId: user.managerId ? user.managerId.toString() : null,
  };
}
