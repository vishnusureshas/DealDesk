import { EventEmitter } from 'node:events';
import type { Types } from 'mongoose';

export interface ChatMessageData {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  clientId?: string;
  createdAt: string;
}

export interface ChatMessageEvent {
  dealId: Types.ObjectId | string;
  message: ChatMessageData;
}

export interface ApprovalRequestedEvent {
  requestId: Types.ObjectId | string;
  dealId: Types.ObjectId | string;
  pct: number;
  currentRole: string;
  branchId: Types.ObjectId | string;
}

export interface ApprovalAdvancedEvent {
  requestId: Types.ObjectId | string;
  dealId: Types.ObjectId | string;
  step: number;
  currentRole: string;
  branchId: Types.ObjectId | string;
}

export interface ApprovalDecidedEvent {
  requestId: Types.ObjectId | string;
  dealId: Types.ObjectId | string;
  action: 'approve' | 'reject' | 'auto_approved';
  requesterId: Types.ObjectId | string;
}

export interface InvoiceStatusChangedEvent {
  invoiceId: Types.ObjectId | string;
  dealId: Types.ObjectId | string;
  ownerId: Types.ObjectId | string;
  from: string;
  to: string;
}

export interface DomainEventMap {
  'chat.message': ChatMessageEvent;
  'approval.requested': ApprovalRequestedEvent;
  'approval.advanced': ApprovalAdvancedEvent;
  'approval.decided': ApprovalDecidedEvent;
  'invoice.status_changed': InvoiceStatusChangedEvent;
}

export type DomainEventName = keyof DomainEventMap;
export type DomainEventPayload<T extends DomainEventName> = DomainEventMap[T];

export const bus = new EventEmitter();

export function emitDomainEvent<T extends DomainEventName>(
  name: T,
  payload: DomainEventMap[T],
): boolean {
  return bus.emit(name, payload);
}
