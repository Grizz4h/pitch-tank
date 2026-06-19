import type { ReactNode } from "react";
import type { StoredSession } from "@/types/pitch";

type ActiveSessionHeaderProps = {
  session: Pick<StoredSession, "competition" | "teamA" | "teamB">;
  statusLabel: string;
  baseTime: string;
  stoppageTime?: string | null;
  isPaused: boolean;
  isSaving?: boolean;
  isCorrectingTime?: boolean;
  timeControl: ReactNode;
  onTogglePause: () => void;
  onFinish: () => void;
};

export function ActiveSessionHeader({ session, statusLabel, baseTime, stoppageTime, isPaused, isSaving = false, isCorrectingTime = false, timeControl, onTogglePause, onFinish }: ActiveSessionHeaderProps) {
  return (
    <section className="live-session-header" aria-label="Laufende Session">
      <div><span>{session.competition}</span><strong>{session.teamA} – {session.teamB}</strong></div>
      <div className="live-clock"><span>{statusLabel}</span><strong>{baseTime}</strong>{stoppageTime ? <small>{stoppageTime}</small> : null}</div>
      <div className="live-header-actions">
        <details className="time-control-menu"><summary>Zeit</summary>{timeControl}</details>
        <button className="button button-secondary" type="button" onClick={onTogglePause} disabled={isCorrectingTime}>{isPaused ? "Weiter" : "Pause"}</button>
        <button className="button button-primary" type="button" onClick={onFinish} disabled={isSaving}>Session beenden</button>
      </div>
    </section>
  );
}
