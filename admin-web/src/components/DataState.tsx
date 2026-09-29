import type { ReactNode } from "react";

export function DataState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="data-state">
        <strong>Loading</strong>
        <span>Fetching the latest records.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-state error">
        <strong>Unable to load</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="data-state">
        <strong>No records found</strong>
        <span>Records will appear here when Firestore has data.</span>
      </div>
    );
  }

  return <>{children}</>;
}

export function StatusChip({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "green" | "red" | "blue" | "yellow" | "neutral";
}) {
  return <span className={`status-chip ${tone}`}>{value}</span>;
}
