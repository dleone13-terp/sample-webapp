import type { BillStatus } from '../types';
import { STATUS_ORDER, STATUS_LABELS } from '../types';

interface Props {
  currentStatus: BillStatus;
}

export function LifecycleTimeline({ currentStatus }: Props) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const isSpecial = currentStatus === 'disputed' || currentStatus === 'cancelled';

  return (
    <div>
      <div className="lifecycle">
        {STATUS_ORDER.map((step, idx) => {
          const isCompleted = !isSpecial && currentIndex > idx;
          const isActive = !isSpecial && currentIndex === idx;

          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div className="lifecycle-step" style={{ minWidth: 0 }}>
                <div
                  className={`lifecycle-step-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <div
                  className={`lifecycle-step-label ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                >
                  {STATUS_LABELS[step]}
                </div>
              </div>
              {idx < STATUS_ORDER.length - 1 && (
                <div
                  className={`lifecycle-connector ${isCompleted ? 'completed' : ''}`}
                />
              )}
            </div>
          );
        })}
      </div>
      {isSpecial && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.875rem',
            background: currentStatus === 'disputed' ? '#fee2e2' : '#f3f4f6',
            color: currentStatus === 'disputed' ? '#dc2626' : '#6b7280',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {currentStatus === 'disputed'
            ? '⚠️ Bill is under dispute'
            : '✕ Bill has been cancelled'}
        </div>
      )}
    </div>
  );
}
