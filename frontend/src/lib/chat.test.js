import { describe, expect, it } from 'vitest';
import {
  mergeMessages,
  mergeThreads,
  messageKey,
  normalize,
  previewOf,
  sortByCreatedAt,
} from './chat';

const at = (seconds) => new Date(Date.UTC(2026, 10, 16, 12, 0, seconds)).toISOString();

describe('normalize', () => {
  it('maps a socket id onto _id', () => {
    expect(normalize({ id: 's1', body: 'hi' })).toEqual({
      id: 's1',
      _id: 's1',
      body: 'hi',
    });
  });
});

describe('messageKey', () => {
  it('prefers clientId over the persisted id for reconciliation', () => {
    expect(messageKey({ clientId: 'c1', _id: 'm1' })).toBe('c:c1');
    expect(messageKey({ _id: 'm1' })).toBe('i:m1');
  });
});

describe('mergeMessages', () => {
  it('reconciles an optimistic message with its ack by clientId', () => {
    const optimistic = {
      _id: 'temp-c1',
      clientId: 'c1',
      body: 'hello',
      createdAt: at(1),
      pending: true,
    };
    const ack = {
      _id: 'm1',
      clientId: 'c1',
      body: 'hello',
      createdAt: at(2),
    };

    const merged = mergeMessages([optimistic], [ack]);

    expect(merged).toHaveLength(1);
    expect(merged[0]._id).toBe('m1');
  });

  it('does not duplicate a persisted message delivered twice', () => {
    const message = { _id: 'm1', body: 'hi', createdAt: at(1) };
    expect(mergeMessages([message], [message])).toHaveLength(1);
  });

  it('keeps distinct messages and sorts oldest to newest', () => {
    const later = { _id: 'm2', body: 'later', createdAt: at(20) };
    const earlier = { _id: 'm1', body: 'earlier', createdAt: at(10) };

    const merged = mergeMessages([later], [earlier]);

    expect(merged.map((message) => message._id)).toEqual(['m1', 'm2']);
  });

  it('lets the incoming copy win for the same key', () => {
    const optimistic = {
      _id: 'temp-c1',
      clientId: 'c1',
      createdAt: at(1),
      pending: true,
    };
    const ack = {
      _id: 'm1',
      clientId: 'c1',
      createdAt: at(2),
      pending: false,
    };

    expect(mergeMessages([optimistic], [ack])[0]).toEqual(ack);
  });
});

describe('mergeThreads', () => {
  it('dedupes by thread id and sorts newest first', () => {
    const older = {
      threadId: 't1',
      lastMessageAt: at(10),
      unreadCount: 1,
    };
    const newer = {
      threadId: 't2',
      lastMessageAt: at(20),
      unreadCount: 0,
    };
    const refreshedOlder = {
      threadId: 't1',
      lastMessageAt: at(30),
      unreadCount: 2,
    };

    const merged = mergeThreads([older], [newer, refreshedOlder]);

    expect(merged.map((thread) => thread.threadId)).toEqual([
      't1',
      't2',
    ]);
    expect(merged[0].unreadCount).toBe(2);
  });
});

describe('sortByCreatedAt', () => {
  it('does not mutate the input array', () => {
    const input = [
      { _id: 'b', createdAt: at(2) },
      { _id: 'a', createdAt: at(1) },
    ];
    const sorted = sortByCreatedAt(input);

    expect(sorted.map((message) => message._id)).toEqual(['a', 'b']);
    expect(input.map((message) => message._id)).toEqual(['b', 'a']);
  });
});

describe('previewOf', () => {
  it('truncates long messages to 80 characters', () => {
    const short = 'hello';
    const long = 'x'.repeat(120);

    expect(previewOf(short)).toBe(short);
    expect(previewOf(long)).toBe(`${'x'.repeat(80)}...`);
  });
});
