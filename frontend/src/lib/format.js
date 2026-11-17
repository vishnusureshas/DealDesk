const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value) {
  if (!value) return '—';
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return '—';
  return dateTimeFormatter.format(new Date(value));
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTime(value) {
  if (!value) return '';
  return timeFormatter.format(new Date(value));
}

export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

// Most collections have no createdAt; Mongo ObjectIds embed one.
export function idTimestamp(id) {
  if (typeof id !== 'string' || id.length < 8) return null;
  const seconds = parseInt(id.slice(0, 8), 16);
  return Number.isNaN(seconds) ? null : new Date(seconds * 1000);
}

export function shortId(id) {
  return typeof id === 'string' ? id.slice(-6) : '';
}

export function initials(email = '') {
  const name = email.split('@')[0].replace(/[._-]+/g, ' ');
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
