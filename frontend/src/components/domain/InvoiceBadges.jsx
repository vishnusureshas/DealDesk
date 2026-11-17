import { Badge } from '../ui';

const STATUS_TONES = {
  pending: 'slate',
  sent: 'blue',
  viewed: 'violet',
  paid: 'emerald',
  failed: 'rose',
  cancelled: 'slate',
};

const STATUS_LABELS = {
  pending: 'Pending',
  sent: 'Sent',
  viewed: 'Viewed',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const PUSH_TONES = {
  queued: 'slate',
  in_flight: 'blue',
  succeeded: 'emerald',
  failed: 'rose',
};

const PUSH_LABELS = {
  queued: 'Queued',
  in_flight: 'In flight',
  succeeded: 'Succeeded',
  failed: 'Push failed',
};

export function InvoiceStatusBadge({ status }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'slate'}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function PushStateBadge({ pushState }) {
  return (
    <Badge tone={PUSH_TONES[pushState] ?? 'slate'}>
      {PUSH_LABELS[pushState] ?? pushState}
    </Badge>
  );
}
