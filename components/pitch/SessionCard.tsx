import type { MouseEvent } from "react";
import type { StoredSession } from "@/types/pitch";

type SessionCardProps = {
  session: StoredSession;
  isSelected: boolean;
  isDeleting?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function getStatusLabel(status?: StoredSession["status"]) {
  if ((status ?? "active") === "active") return "aktiv";
  if (status === "completed") return "abgeschlossen";
  return "verworfen";
}

export function SessionCard({ session, isSelected, isDeleting = false, onOpen, onEdit, onDelete, onSelect }: SessionCardProps) {
  const handleAction = (event: MouseEvent, action: () => void) => {
    event.stopPropagation();
    action();
  };

  return (
    <article className={isSelected ? "history-item session-card active" : "history-item session-card"} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}>
      <div className="session-card-main">
        <span>{session.sessionName}</span>
        <strong>{session.teamA} – {session.teamB}</strong>
        <small>{session.competition} · {formatDate(session.createdAt)}</small>
      </div>
      <div className="session-card-meta">
        <span>Track: {session.track}</span>
        <span>{session.observations.length} Beobachtungen</span>
        <span>Status: {getStatusLabel(session.status)}</span>
      </div>
      <div className="session-card-actions">
        <button className="button button-primary" type="button" onClick={(event) => handleAction(event, onOpen)}>Öffnen</button>
        <button className="button button-secondary" type="button" onClick={(event) => handleAction(event, onEdit)}>Bearbeiten</button>
        <button className="button danger-button" type="button" onClick={(event) => handleAction(event, onDelete)} disabled={isDeleting}>{isDeleting ? "Lösche..." : "Löschen"}</button>
      </div>
    </article>
  );
}
