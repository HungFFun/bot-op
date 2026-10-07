import { PO_STATUS_LABELS, type PoStatus } from '@bot-op/shared';

const STYLES: Record<PoStatus, string> = {
  submitted: 'bg-elephant-soft text-ink',
  approved: 'bg-bamboo-soft text-bamboo-dark',
  ordered: 'bg-bamboo-soft text-bamboo-dark',
  received: 'bg-bamboo-dark text-white',
  rejected: 'bg-chili-soft text-chili-strong',
  cancelled: 'bg-cream text-ink-muted',
};

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status]}`}>
      {PO_STATUS_LABELS[status]}
    </span>
  );
}
