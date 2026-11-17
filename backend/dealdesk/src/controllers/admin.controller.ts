import type { RequestHandler } from 'express';
import { PERMISSION_CATALOG } from '../constants/permissions';
import * as approvalService from '../services/approval.service';
import * as roleService from '../services/role.service';
import { asyncHandler } from '../utils/asyncHandler';

export const getPermissions: RequestHandler = asyncHandler(
  async (_req, res) => {
    res.status(200).json({ items: PERMISSION_CATALOG });
  },
);

export const getRoles: RequestHandler = asyncHandler(async (_req, res) => {
  res.status(200).json({ items: await roleService.listRoles() });
});

export const createRole: RequestHandler = asyncHandler(async (req, res) => {
  const role = await roleService.createRole(
    req.body as roleService.CreateRoleInput,
  );

  res.status(201).json(role);
});

export const updateRole: RequestHandler = asyncHandler(async (req, res) => {
  const role = await roleService.updateRole(
    req.params.id,
    req.body as roleService.UpdateRoleInput,
  );

  res.status(200).json(role);
});

export const getApprovalConfig: RequestHandler = asyncHandler(
  async (_req, res) => {
    res
      .status(200)
      .json({ items: await approvalService.getApprovalConfig() });
  },
);

export const putApprovalConfig: RequestHandler = asyncHandler(
  async (req, res) => {
    const { bands } = req.body as {
      bands: approvalService.ApprovalBandInput[];
    };
    const saved = await approvalService.saveApprovalConfig(bands);

    res.status(200).json({ items: saved });
  },
);
