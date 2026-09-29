import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function SearchFilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  filter,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filter?: ReactNode;
}) {
  return (
    <div className="table-toolbar">
      <div className="table-search">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </div>
      {filter}
    </div>
  );
}

export function EmptyState({
  title = "No records found",
  description = "Records will appear here when data is available.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="data-state">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal confirm-modal">
        <div className="admin-modal-header">
          <div>
            <h2>{title}</h2>
            <span>{description}</span>
          </div>
        </div>
        <div className="modal-actions">
          <button className="secondary-action" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-action" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
