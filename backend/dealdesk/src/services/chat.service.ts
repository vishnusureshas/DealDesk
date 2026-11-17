import type { HydratedDocument } from 'mongoose';
import { Types } from 'mongoose';
import { emitDomainEvent, type ChatMessageData } from '../events/bus';
import { Deal, type DealAttrs } from '../models/Deal';
import { Message, type MessageAttrs } from '../models/Message';
import type { Scope } from '../models/Role';
import { Thread, type ThreadAttrs } from '../models/Thread';
import { ApiError } from '../utils/ApiError';
import { isObjectIdString } from '../utils/objectId';
import {
  paginateQuery,
  parseLimit,
  parsePagination,
} from '../utils/pagination';
import { dealScopeFilter, type ScopeUser } from '../utils/scope';

export async function createDealThread(
  dealId: Types.ObjectId,
  ownerId: Types.ObjectId,
  managerId: Types.ObjectId | null,
  createdAt: Date,
): Promise<void> {
  const participants = [
    {
      userId: ownerId,
      joinedAt: createdAt,
      lastReadAt: createdAt,
    },
  ];

  if (managerId && !managerId.equals(ownerId)) {
    participants.push({
      userId: managerId,
      joinedAt: createdAt,
      lastReadAt: createdAt,
    });
  }

  await Thread.create({ dealId, participants });
}

export interface ChatMessageInput {
  body: string;
  clientId?: string;
}

export interface ChatMessageResult {
  message: HydratedDocument<MessageAttrs>;
  joined: boolean;
}

async function assertDealVisible(
  dealId: Types.ObjectId | string,
  user: ScopeUser,
  scope: Scope,
) {
  const deal = await Deal.findOne({
    _id: dealId,
    ...dealScopeFilter<DealAttrs>(user, scope),
  }).exec();

  if (!deal) {
    throw new ApiError(404, 'NOT_FOUND', 'Deal not found');
  }

  return deal;
}

function isParticipant(
  thread: HydratedDocument<ThreadAttrs>,
  userId: Types.ObjectId | string,
): boolean {
  return thread.participants.some(
    (participant) => participant.userId.toString() === userId.toString(),
  );
}

async function findThreadById(
  threadId: string,
  user: ScopeUser,
  scope: Scope,
  requireParticipation: boolean,
) {
  if (!isObjectIdString(threadId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }

  const thread = await Thread.findById(threadId).exec();

  if (!thread) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }

  await assertDealVisible(thread.dealId, user, scope);

  if (requireParticipation && !isParticipant(thread, user._id)) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }

  return thread;
}

async function findThreadByDealId(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
  requireParticipation: boolean,
) {
  if (!isObjectIdString(dealId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }

  const thread = await Thread.findOne({ dealId }).exec();

  if (!thread) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }

  await assertDealVisible(thread.dealId, user, scope);

  if (requireParticipation && !isParticipant(thread, user._id)) {
    throw new ApiError(404, 'NOT_FOUND', 'Thread not found');
  }

  return thread;
}

function toMessageData(
  message: HydratedDocument<MessageAttrs>,
): ChatMessageData {
  return {
    id: message._id.toString(),
    threadId: message.threadId.toString(),
    senderId: message.senderId.toString(),
    body: message.body,
    ...(message.clientId ? { clientId: message.clientId } : {}),
    createdAt: message.createdAt.toISOString(),
  };
}

interface ThreadCursor {
  lastMessageAt: number;
  threadId: string;
}

function parseThreadCursor(raw: unknown): ThreadCursor | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  if (typeof raw !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }

  const { lastMessageAt, threadId } = parsed as {
    lastMessageAt?: unknown;
    threadId?: unknown;
  };

  if (
    typeof lastMessageAt !== 'number' ||
    !Number.isFinite(lastMessageAt) ||
    typeof threadId !== 'string' ||
    !isObjectIdString(threadId)
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }

  return { lastMessageAt, threadId };
}

function encodeThreadCursor(item: {
  lastMessageAt: Date;
  threadId: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      lastMessageAt: item.lastMessageAt.getTime(),
      threadId: item.threadId,
    }),
  ).toString('base64url');
}

export async function listThreads(
  user: ScopeUser,
  scope: Scope,
  query: Record<string, unknown> = {},
) {
  const limit = parseLimit(query.limit);
  const cursor = parseThreadCursor(query.cursor);
  const visibleDeals = await Deal.find({
    ...dealScopeFilter<DealAttrs>(user, scope),
  })
    .select('_id title')
    .lean()
    .exec();
  const dealIds = visibleDeals.map((deal) => deal._id);
  const dealsById = new Map(
    visibleDeals.map((deal) => [deal._id.toString(), deal]),
  );

  if (dealIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const threads = await Thread.find({
    dealId: { $in: dealIds },
    'participants.userId': user._id,
  })
    .lean()
    .exec();

  const items = await Promise.all(
    threads.map(async (thread) => {
      const participant = thread.participants.find(
        (candidate) =>
          candidate.userId.toString() === user._id.toString(),
      );

      if (!participant) {
        return null;
      }

      const [lastMessage, unreadCount] = await Promise.all([
        Message.findOne({ threadId: thread._id })
          .sort({ _id: -1 })
          .lean()
          .exec(),
        Message.countDocuments({
          threadId: thread._id,
          createdAt: { $gt: participant.lastReadAt },
          senderId: { $ne: user._id },
        }).exec(),
      ]);
      const preview = lastMessage
        ? lastMessage.body.length > 80
          ? `${lastMessage.body.slice(0, 80)}...`
          : lastMessage.body
        : null;
      const deal = dealsById.get(thread.dealId.toString());

      return {
        threadId: thread._id.toString(),
        dealId: thread.dealId.toString(),
        title: deal?.title ?? '',
        lastMessage: lastMessage
          ? {
              preview:
                preview ?? lastMessage.body,
              body: preview ?? lastMessage.body,
              senderId: lastMessage.senderId.toString(),
              createdAt: lastMessage.createdAt,
            }
          : null,
        lastMessageAt:
          lastMessage?.createdAt ?? thread._id.getTimestamp(),
        unreadCount,
        lastReadAt: participant.lastReadAt,
      };
    }),
  );

  const sortedItems = items
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => {
      const timeDelta =
        right.lastMessageAt.getTime() - left.lastMessageAt.getTime();

      if (timeDelta !== 0) {
        return timeDelta;
      }

      return right.threadId.localeCompare(left.threadId);
    });
  const remainingItems = cursor
    ? sortedItems.filter((item) => {
        const lastMessageAt = item.lastMessageAt.getTime();

        return (
          lastMessageAt < cursor.lastMessageAt ||
          (lastMessageAt === cursor.lastMessageAt &&
            item.threadId < cursor.threadId)
        );
      })
    : sortedItems;
  const pageItems = remainingItems.slice(0, limit);
  const hasNextPage = remainingItems.length > limit;

  return {
    items: pageItems,
    nextCursor:
      hasNextPage && pageItems.length > 0
        ? encodeThreadCursor(pageItems[pageItems.length - 1])
        : null,
  };
}

export async function listThreadMessages(
  threadId: string,
  user: ScopeUser,
  scope: Scope,
  query: Record<string, unknown>,
) {
  const thread = await findThreadById(threadId, user, scope, true);
  const { limit, cursor } = parsePagination(query);

  return paginateQuery<MessageAttrs>(
    Message,
    { threadId: thread._id },
    { limit, cursor, sort: { _id: -1 } },
  );
}

async function persistMessage(
  thread: HydratedDocument<ThreadAttrs>,
  user: ScopeUser,
  input: ChatMessageInput,
): Promise<ChatMessageResult> {
  const body = input.body.trim();

  if (body.length === 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Message body is required',
    );
  }

  const now = new Date();
  const message = await Message.create({
    threadId: thread._id,
    senderId: user._id,
    body,
    ...(input.clientId ? { clientId: input.clientId } : {}),
    createdAt: now,
  });

  const joinedResult = await Thread.updateOne(
    {
      _id: thread._id,
      'participants.userId': { $ne: user._id },
    },
    {
      $push: {
        participants: {
          userId: user._id,
          joinedAt: now,
          lastReadAt: now,
        },
      },
    },
  ).exec();

  await Thread.updateOne(
    {
      _id: thread._id,
      'participants.userId': user._id,
    },
    {
      $set: {
        'participants.$.lastReadAt': now,
      },
    },
  ).exec();

  emitDomainEvent('chat.message', {
    dealId: thread.dealId,
    message: toMessageData(message),
  });

  return {
    message,
    joined: joinedResult.matchedCount > 0,
  };
}

export async function sendThreadMessage(
  threadId: string,
  user: ScopeUser,
  scope: Scope,
  input: ChatMessageInput,
): Promise<ChatMessageResult> {
  const thread = await findThreadById(threadId, user, scope, false);
  return persistMessage(thread, user, input);
}

export async function sendDealMessage(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
  input: ChatMessageInput,
): Promise<ChatMessageResult> {
  const thread = await findThreadByDealId(
    dealId,
    user,
    scope,
    false,
  );
  return persistMessage(thread, user, input);
}

export async function markThreadRead(
  threadId: string,
  user: ScopeUser,
  scope: Scope,
) {
  const thread = await findThreadById(threadId, user, scope, true);
  const now = new Date();

  await Thread.updateOne(
    {
      _id: thread._id,
      'participants.userId': user._id,
    },
    {
      $set: {
        'participants.$.lastReadAt': now,
      },
    },
  ).exec();

  return { lastReadAt: now };
}

export async function markDealThreadRead(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
) {
  const thread = await findThreadByDealId(
    dealId,
    user,
    scope,
    true,
  );
  const now = new Date();

  await Thread.updateOne(
    {
      _id: thread._id,
      'participants.userId': user._id,
    },
    {
      $set: {
        'participants.$.lastReadAt': now,
      },
    },
  ).exec();

  return { lastReadAt: now };
}

export async function joinThread(
  dealId: string,
  user: ScopeUser,
  scope: Scope,
) {
  return findThreadByDealId(dealId, user, scope, true);
}
