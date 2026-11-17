import { randomUUID } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import type { DefaultEventsMap, Socket } from 'socket.io';
import {
  bus,
  type ApprovalAdvancedEvent,
  type ApprovalDecidedEvent,
  type ApprovalRequestedEvent,
  type ChatMessageEvent,
  type InvoiceStatusChangedEvent,
} from '../events/bus';
import {
  DiscountRequest,
  type DiscountRequestAttrs,
} from '../models/DiscountRequest';
import { Invoice } from '../models/Invoice';
import { Role } from '../models/Role';
import { User, type UserAttrs } from '../models/User';
import { findApprovers } from '../services/approver.service';
import * as chatService from '../services/chat.service';
import {
  createNotification,
  type NotificationType,
} from '../services/notification.service';
import { ApiError } from '../utils/ApiError';
import { getScope } from '../utils/scope';
import type {
  AuthenticatedSocketData,
  DealDeskSocketServer,
} from './socketAuth';

type ChatSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  AuthenticatedSocketData
>;

type Ack = ((response: unknown) => void) | undefined;

function readStringField(value: unknown, field: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[field];

  return typeof candidate === 'string' ? candidate : null;
}

interface SocketEnvelope<T> {
  id: string;
  type: string;
  ts: string;
  data: T;
}

function envelope<T>(type: string, data: T): SocketEnvelope<T> {
  return {
    id: randomUUID(),
    type,
    ts: new Date().toISOString(),
    data,
  };
}

export class RealtimeGateway {
  private started = false;

  constructor(private readonly io: DealDeskSocketServer) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    this.io.on('connection', (socket) => {
      const user = socket.data.user;

      if (!user) {
        socket.disconnect(true);
        return;
      }

      socket.join(`user:${user._id.toString()}`);
      this.registerChatHandlers(socket);
    });

    bus.on('chat.message', (payload: ChatMessageEvent) => {
      this.handleChatMessage(payload);
    });

    bus.on('approval.requested', (payload: ApprovalRequestedEvent) => {
      void this.handleApprovalRequested(payload).catch((error) => {
        console.error('[gateway] approval.requested failed', error);
      });
    });

    bus.on('approval.advanced', (payload: ApprovalAdvancedEvent) => {
      void this.handleApprovalAdvanced(payload).catch((error) => {
        console.error('[gateway] approval.advanced failed', error);
      });
    });

    bus.on('approval.decided', (payload: ApprovalDecidedEvent) => {
      void this.handleApprovalDecided(payload).catch((error) => {
        console.error('[gateway] approval.decided failed', error);
      });
    });

    bus.on('invoice.status_changed', (payload: InvoiceStatusChangedEvent) => {
      void this.handleInvoiceStatusChanged(payload).catch((error) => {
        console.error('[gateway] invoice.status_changed failed', error);
      });
    });
  }

  private handleChatMessage(payload: ChatMessageEvent): void {
    const dealId = payload.dealId.toString();
    const data = {
      dealId,
      message: payload.message,
      ...(payload.message.clientId
        ? { clientId: payload.message.clientId }
        : {}),
    };

    this.io
      .in(`user:${payload.message.senderId}`)
      .socketsJoin(`thread:${dealId}`);
    this.io
      .to(`thread:${dealId}`)
      .emit('chat:message', envelope('chat:message', data));
  }

  private registerChatHandlers(socket: ChatSocket): void {
    socket.on(
      'thread:join',
      (payload: unknown, ack: Ack) => {
        void this.handleThreadJoin(socket, payload, ack);
      },
    );

    socket.on(
      'message:send',
      (payload: unknown, ack: Ack) => {
        void this.handleMessageSend(socket, payload, ack);
      },
    );

    socket.on(
      'thread:read',
      (payload: unknown, ack: Ack) => {
        void this.handleThreadRead(socket, payload, ack);
      },
    );
  }

  private async getChatSession(socket: ChatSocket) {
    const sessionUser = socket.data.user;

    if (!sessionUser) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
    }

    const user = await User.findById(sessionUser._id).exec();

    if (!user) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
    }

    const role = await Role.findById(user.roleId).exec();

    if (!role) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
    }

    const canChat = role.permissions.some(
      (permission) => permission.key === 'chat.send',
    );

    if (!canChat) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Missing permission: chat.send',
      );
    }

    const dealScope = getScope(role, 'deal.view');

    if (!dealScope) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Missing permission: deal.view',
      );
    }

    return { user, role, dealScope };
  }

  private ackError(ack: Ack, error: unknown): void {
    const normalized =
      error instanceof ApiError
        ? error
        : new ApiError(500, 'INTERNAL_ERROR', 'Internal server error');

    if (ack) {
      ack({
        ok: false,
        error: {
          code: normalized.code,
          message: normalized.message,
        },
      });
      return;
    }

    console.error('[gateway] Socket event failed', error);
  }

  private async handleThreadJoin(
    socket: ChatSocket,
    payload: unknown,
    ack: Ack,
  ): Promise<void> {
    try {
      const dealId = readStringField(payload, 'dealId');

      if (!dealId) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'dealId is required',
        );
      }

      const { user, dealScope } = await this.getChatSession(socket);
      await chatService.joinThread(dealId, user, dealScope);
      socket.join(`thread:${dealId}`);
      ack?.({ ok: true, dealId });
    } catch (error) {
      this.ackError(ack, error);
    }
  }

  private async handleMessageSend(
    socket: ChatSocket,
    payload: unknown,
    ack: Ack,
  ): Promise<void> {
    try {
      const dealId = readStringField(payload, 'dealId');
      const body = readStringField(payload, 'body');
      const rawClientId = readStringField(payload, 'clientId');

      if (!dealId) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'dealId is required',
        );
      }

      if (!body || body.trim().length === 0) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Message body is required',
        );
      }

      if (body.trim().length > 2000) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Message body is too long',
        );
      }

      if (
        rawClientId !== null &&
        (rawClientId.trim().length === 0 ||
          rawClientId.trim().length > 100)
      ) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'clientId is invalid',
        );
      }

      const { user, dealScope } = await this.getChatSession(socket);
      const { message } = await chatService.sendDealMessage(
        dealId,
        user,
        dealScope,
        {
          body,
          ...(rawClientId ? { clientId: rawClientId } : {}),
        },
      );

      ack?.({ ok: true, message: message.toObject() });
    } catch (error) {
      this.ackError(ack, error);
    }
  }

  private async handleThreadRead(
    socket: ChatSocket,
    payload: unknown,
    ack: Ack,
  ): Promise<void> {
    try {
      const dealId = readStringField(payload, 'dealId');

      if (!dealId) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'dealId is required',
        );
      }

      const { user, dealScope } = await this.getChatSession(socket);
      const result = await chatService.markDealThreadRead(
        dealId,
        user,
        dealScope,
      );

      ack?.({
        ok: true,
        lastReadAt: result.lastReadAt.toISOString(),
      });
    } catch (error) {
      this.ackError(ack, error);
    }
  }

  private async handleApprovalRequested(
    payload: ApprovalRequestedEvent,
  ): Promise<void> {
    const request = await DiscountRequest.findById(payload.requestId).exec();

    if (!request) {
      return;
    }

    const approvers = await findApprovers(
      payload.currentRole,
      payload.branchId,
      request.requestedBy,
    );

    await this.notifyApprovers(
      approvers,
      'approval:requested',
      {
        requestId: payload.requestId.toString(),
        dealId: payload.dealId.toString(),
        pct: payload.pct,
        currentRole: payload.currentRole,
        step: request.currentStep,
      },
      request,
    );
  }

  private async handleApprovalAdvanced(
    payload: ApprovalAdvancedEvent,
  ): Promise<void> {
    const request = await DiscountRequest.findById(payload.requestId).exec();

    if (!request) {
      return;
    }

    const approvers = await findApprovers(
      payload.currentRole,
      payload.branchId,
      request.requestedBy,
    );

    await this.notifyApprovers(
      approvers,
      'approval:requested',
      {
        requestId: payload.requestId.toString(),
        dealId: payload.dealId.toString(),
        step: payload.step,
        currentRole: payload.currentRole,
      },
      request,
    );
  }

  private async handleApprovalDecided(
    payload: ApprovalDecidedEvent,
  ): Promise<void> {
    const request = await DiscountRequest.findById(payload.requestId).exec();
    const notification = await createNotification(
      payload.requesterId,
      'approval:decided',
      {
        requestId: payload.requestId.toString(),
        dealId: payload.dealId.toString(),
        action: payload.action,
      },
    );

    this.io
      .to(`user:${payload.requesterId.toString()}`)
      .emit(
        'notification',
        envelope('approval:decided', { notification, request }),
      );
  }

  private async handleInvoiceStatusChanged(
    payload: InvoiceStatusChangedEvent,
  ): Promise<void> {
    const invoice = await Invoice.findById(payload.invoiceId).exec();
    const notification = await createNotification(
      payload.ownerId,
      'invoice:status_changed',
      {
        invoiceId: payload.invoiceId.toString(),
        dealId: payload.dealId.toString(),
        from: payload.from,
        to: payload.to,
      },
    );

    this.io
      .to(`user:${payload.ownerId.toString()}`)
      .emit(
        'notification',
        envelope('invoice:status_changed', { notification, invoice }),
      );
  }

  private async notifyApprovers(
    approvers: HydratedDocument<UserAttrs>[],
    type: NotificationType,
    notificationPayload: Record<string, unknown>,
    request: HydratedDocument<DiscountRequestAttrs>,
  ): Promise<void> {
    await Promise.all(
      approvers.map(async (approver) => {
        const notification = await createNotification(
          approver._id,
          type,
          notificationPayload,
        );

        this.io
          .to(`user:${approver._id.toString()}`)
          .emit(
            'notification',
            envelope(type, { notification, request }),
          );
      }),
    );
  }
}
