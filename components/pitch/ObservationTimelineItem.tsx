import type { ReactNode } from "react";

type ObservationTimelineItemProps = {
  matchTime: string;
  secondary: ReactNode;
  status: ReactNode;
  details?: ReactNode;
  isInteresting?: boolean;
  variant?: "a1" | "a2";
  isSaving?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function ObservationTimelineItem({ matchTime, secondary, status, details, isInteresting = false, variant = "a1", isSaving = false, onEdit, onDelete }: ObservationTimelineItemProps) {
  const className = ["live-timeline-item", variant === "a2" ? "a2-timeline-item" : "", isInteresting ? "interesting" : ""].filter(Boolean).join(" ");
  return (
    <article className={className}>
      <time>{isInteresting ? "★ " : ""}{matchTime}</time>
      <span>{secondary}</span>
      <strong>{status}</strong>
      {details ? <small>{details}</small> : null}
      {(onEdit || onDelete) ? (
        <div className="log-actions">
          {onEdit ? <button type="button" onClick={onEdit} disabled={isSaving}>Bearbeiten</button> : null}
          {onDelete ? <button type="button" onClick={onDelete} disabled={isSaving}>Löschen</button> : null}
        </div>
      ) : null}
    </article>
  );
}
