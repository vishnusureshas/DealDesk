import { Badge } from '../ui';

const TONES = {
  open: 'slate',
  pending_approval: 'amber',
  won: 'emerald',
};

const LABELS = {
  open: 'Open',
  pending_approval: 'Pending approval',
  won: 'Won',
};

export default function DealStatusBadge({ status }) {
  return <Badge tone={TONES[status] ?? 'slate'}>{LABELS[status] ?? status}</Badge>;
}
