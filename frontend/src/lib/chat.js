export const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const normalize = (message) => ({
  ...message,
  _id: message._id ?? message.id,
});

export const messageKey = (message) =>
  message.clientId ? `c:${message.clientId}` : `i:${message._id}`;

export function mergeThreads(existing, incoming) {
  const map = new Map();
  existing.forEach((thread) => map.set(String(thread.threadId), thread));
  incoming.forEach((thread) => map.set(String(thread.threadId), thread));

  return [...map.values()].sort(
    (left, right) =>
      new Date(right.lastMessageAt).getTime() -
      new Date(left.lastMessageAt).getTime(),
  );
}

export function sortByCreatedAt(messages) {
  return [...messages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

// Reconciles optimistic messages with their ack/echo by clientId, then falls
// back to the persisted id, so a message is never shown twice.
export function mergeMessages(existing, incoming) {
  const map = new Map();
  existing.forEach((message) => map.set(messageKey(message), message));
  incoming.forEach((message) => map.set(messageKey(message), message));
  return sortByCreatedAt([...map.values()]);
}

export function previewOf(body = '') {
  return body.length > 80 ? `${body.slice(0, 80)}...` : body;
}
