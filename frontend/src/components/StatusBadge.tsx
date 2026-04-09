import type { BillStatus } from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';

interface Props {
  status: BillStatus;
}

export function StatusBadge({ status }: Props) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="badge"
      style={{
        background: color + '20',
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
