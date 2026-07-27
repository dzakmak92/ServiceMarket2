import React from 'react';

const STATUS_CLASSES = {
  open: 'status-open',
  in_progress: 'status-in_progress',
  completed: 'status-completed',
  cancelled: 'status-cancelled',
  pending: 'status-pending',
  accepted: 'status-accepted',
  declined: 'status-declined',
};

const STATUS_LABELS = {
  open: 'Open', in_progress: 'In Progress', completed: 'Completed',
  cancelled: 'Cancelled', pending: 'Pending', accepted: 'Accepted', declined: 'Not selected',
};

export default function StatusPill({ status, className = '' }) {
  const cls = STATUS_CLASSES[status] || 'status-pending';
  const label = STATUS_LABELS[status] || status;
  return <span className={`${cls} ${className}`}>{label}</span>;
}
