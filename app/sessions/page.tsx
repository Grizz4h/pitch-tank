"use client";

import { useEffect, useMemo, useState } from "react";

type AccountUser = {
  id: string;
  profileId: string;
  profileName: string;
  email: string;
  createdAt: string;
};

type MatchTimeMeta = { totalSeconds: number; baseTime: string; stoppageTime: string | null; periodLabel: string };

type Observation = {
  id: string;
  time: string;
  matchTime?: string;
  matchTimeMeta?: MatchTimeMeta;
  isInteresting?: boolean;
  track?: string;
  optionCount?: "1" | "2" | "3" | "4" | "5+";
  bestOption?: string;
  played?: string;
  pressureLevel?: string;
  pressureDirection?: string;
  timeWindow?: string;
  solutionQuality?: string;
  outcome: string;
};

type StoredSession = {
  id: string;
  profileId: string;
  profileName: string;
  competition: string;
  teamA: string;
  teamB: string;
  focusTeam: string;
  phase: string;
  track: string;
  trackTitle: string;
  sessionName: string;
  sessionStartMatchTime?: string;
  sessionStartTimestamp?: string;
  status?: "active" | "completed" | "abandoned";
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  observations: Observation[];
};

const TOKEN_STORAGE_KEY = "pitch-tank.token";
const ACCOUNT_STORAGE_KEY = "pitch-tank.account";
const ACTIVE_SESSION_KEY = "pitch-tank.activeSessionId";
const SESSION_CACHE_KEY = "pitchTank.sessions";

const optionValues: Record<"1" | "2" | "3" | "4" | "5+", number> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5+": 5,
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusLabel(status?: StoredSession["status"]) {
  if ((status ?? "active") === "active") return "aktiv";
  if (status === "completed") return "abgeschlossen";
  return "verworfen";
}

function formatDuration(startValue: string, endValue?: string | null) {
  if (!endValue) return "läuft";
  const start = Date.parse(startValue);
  const end = Date.parse(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
  const totalSeconds = Math.floor((end - start) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatObservationMatchTime(observation: Observation) {
  if (observation.matchTimeMeta) {
    const baseTime = observation.matchTimeMeta.baseTime;
    const stoppageTime = observation.matchTimeMeta.stoppageTime;
    return stoppageTime ? baseTime + " " + stoppageTime : baseTime;
  }
  return observation.matchTime ?? observation.time;
}

export default function SessionsPage() {
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSessions() {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedAccount = localStorage.getItem(ACCOUNT_STORAGE_KEY);

      if (storedAccount) {
        try {
          setAccount(JSON.parse(storedAccount) as AccountUser);
        } catch {
          localStorage.removeItem(ACCOUNT_STORAGE_KEY);
        }
      }

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const [meResponse, sessionsResponse] = await Promise.all([
          fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/sessions", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (!meResponse.ok || !sessionsResponse.ok) {
          throw new Error("Bitte erneut einloggen. Der Verlauf konnte nicht geladen werden.");
        }

        const user = (await meResponse.json()) as AccountUser;
        const loadedSessions = (await sessionsResponse.json()) as StoredSession[];
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(user));
        setAccount(user);
        localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(loadedSessions));
        setSessions(loadedSessions);
        setSelectedSessionId(loadedSessions[0]?.id ?? null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Verlauf konnte nicht geladen werden.");
      } finally {
        setIsLoading(false);
      }
    }

    loadSessions();
  }, []);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null;
  const isSelectedSessionActive = (selectedSession?.status ?? "active") === "active";
  const interestingScenes = selectedSession?.observations.filter((item) => item.isInteresting) ?? [];

  const isA2Session = selectedSession?.track === "A2" || Boolean(selectedSession?.observations.some((item) => item.track === "A2" || item.pressureLevel));

  const sessionStats = useMemo(() => {
    if (!selectedSession) {
      return { observations: 0, averageOptions: "0", playedRate: 0, mostCommonLevel: "-", goodRate: 0 };
    }

    if (isA2Session) {
      const a2Items = selectedSession.observations.filter((item) => item.track === "A2" || item.pressureLevel);
      const levelCounts = a2Items.reduce<Record<string, number>>((counts, item) => {
        if (item.pressureLevel) counts[item.pressureLevel] = (counts[item.pressureLevel] ?? 0) + 1;
        return counts;
      }, {});
      const mostCommonLevel = Object.entries(levelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
      const goodSolutions = a2Items.filter((item) => item.solutionQuality === "gut gelöst").length;
      return { observations: a2Items.length, averageOptions: "0", playedRate: 0, mostCommonLevel, goodRate: a2Items.length ? Math.round((goodSolutions / a2Items.length) * 100) : 0 };
    }

    const a1Items = selectedSession.observations.filter((item) => item.optionCount);
    const playedDecisions = a1Items.filter((item) => item.played !== "Unsicher");
    const playedYes = playedDecisions.filter((item) => item.played === "Ja").length;
    const averageOptions = a1Items.length
      ? a1Items.reduce((sum, item) => sum + optionValues[item.optionCount ?? "1"], 0) / a1Items.length
      : 0;

    return {
      observations: selectedSession.observations.length,
      averageOptions: a1Items.length ? averageOptions.toFixed(1) : "0",
      playedRate: playedDecisions.length ? Math.round((playedYes / playedDecisions.length) * 100) : 0,
      mostCommonLevel: "-",
      goodRate: 0,
    };
  }, [selectedSession, isA2Session]);

  function continueSession(session: StoredSession) {
    localStorage.setItem(ACTIVE_SESSION_KEY, session.id);
    window.location.href = session.track === "A2" ? "/tracks/a/a2" : "/tracks/a/a1";
  }

  async function deleteSession(session: StoredSession) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;
    const label = session.sessionName || `${session.competition} | ${session.teamA} – ${session.teamB} | ${session.track}`;
    if (!window.confirm(`Session wirklich löschen?\n\n${label}\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)) return;

    setIsDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Session konnte nicht gelöscht werden.");

      const nextSessions = sessions.filter((item) => item.id !== session.id);
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(nextSessions));
      if (localStorage.getItem(ACTIVE_SESSION_KEY) === session.id) {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
      setSessions(nextSessions);
      setSelectedSessionId(nextSessions[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Session konnte nicht gelöscht werden.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="history-shell">
      <header className="track-topbar">
        <a className="brand" href="/" aria-label="Zur Pitch-Tank-Startseite">
          <span className="brand-mark" aria-hidden="true">PT</span>
          <span>Pitch Tank</span>
        </a>
        <nav className="nav-links" aria-label="Bereiche">
          <a href="/account">Account</a>
          <a href="/tracks/a/a1">A1</a>
          <a href="/tracks/a/a2">A2</a>
          <a href="/">Startseite</a>
        </nav>
      </header>

      <section className="account-hero" aria-labelledby="history-title">
        <p className="eyebrow">Verlauf</p>
        <h1 id="history-title">Deine gespeicherten Sessions</h1>
        <p>Aktive, abgeschlossene und bewusst verworfene Sessions bleiben im Pitch-Tank-Backend deinem Profil zugeordnet.</p>
      </section>

      {isLoading ? <section className="account-card"><p className="empty-state">Lade Verlauf...</p></section> : null}
      {error ? <section className="account-card"><p className="account-error">{error}</p></section> : null}

      {!isLoading && !account ? (
        <section className="account-card">
          <h2>Kein Profil gefunden</h2>
          <p className="empty-state">Erstelle zuerst ein Profil oder logge dich ein, damit Sessions geladen werden können.</p>
          <a className="button button-primary" href="/account">Zum Account</a>
        </section>
      ) : null}

      {account ? (
        <section className="history-profile-card" aria-label="Aktives Profil">
          <div>
            <p className="eyebrow">Aktives Profil</p>
            <h2>{account.profileName}</h2>
            <p>{account.profileId}</p>
          </div>
          <a className="button button-secondary" href="/account">Profil bearbeiten</a>
        </section>
      ) : null}

      {account && !sessions.length && !isLoading ? (
        <section className="account-card">
          <h2>Noch keine Sessions</h2>
          <p className="empty-state">Starte A1, lege eine Session an und speichere deine ersten Beobachtungen.</p>
          <a className="button button-primary" href="/tracks/a/a1">A1 starten</a>
        </section>
      ) : null}

      {sessions.length ? (
        <section className="history-layout" aria-label="Session-Verlauf">
          <div className="history-list">
            {sessions.map((session) => (
              <button
                className={session.id === selectedSession?.id ? "history-item active" : "history-item"}
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
              >
                <span>{session.track} · {session.competition}</span>
                <strong>{session.teamA} – {session.teamB}</strong>
                <small>Status: {getStatusLabel(session.status)} · {session.observations.length} Beobachtungen</small>
              </button>
            ))}
          </div>

          {selectedSession ? (
            <article className={isSelectedSessionActive ? "history-detail active-history-detail" : "history-detail"}>
              {isSelectedSessionActive ? (
                <section className="active-history-banner" aria-label="Laufende Session">
                  <div><span>Laufende Session</span><strong>{selectedSession.teamA} – {selectedSession.teamB}</strong><small>{selectedSession.competition} · {selectedSession.track} – {selectedSession.trackTitle}</small></div>
                  <a className="button button-primary" href={selectedSession.track === "A2" ? "/tracks/a/a2" : "/tracks/a/a1"} onClick={() => localStorage.setItem(ACTIVE_SESSION_KEY, selectedSession.id)}>Fortsetzen</a>
                </section>
              ) : null}
              <p className="eyebrow">Session</p>
              <h2>{selectedSession.sessionName}</h2>
              <div className="active-session-grid">
                <span>{selectedSession.competition}</span>
                <span>{selectedSession.teamA} – {selectedSession.teamB}</span>
                <span>{selectedSession.phase || "Phase nicht gesetzt"}</span>
                <span>Fokus: {selectedSession.focusTeam}</span>
                <span>Track: {selectedSession.track} – {selectedSession.trackTitle}</span>
                <span>Start-Spielzeit: {selectedSession.sessionStartMatchTime ?? "00:00"}</span>
                <span>Status: {getStatusLabel(selectedSession.status)}</span>
                <span>Dauer: {formatDuration(selectedSession.createdAt, selectedSession.endedAt)}</span>
                <span>Interessante Szenen: {interestingScenes.length}</span>
              </div>

              <div className="stats-grid history-stats">
                <article className="stat-card">
                  <span>{isA2Session ? "Drucksituationen" : "Beobachtungen"}</span>
                  <strong>{sessionStats.observations}</strong>
                </article>
                <article className="stat-card">
                  <span>{isA2Session ? "Häufigstes Druckniveau" : "Durchschnittlich erkannte Optionen"}</span>
                  <strong>{isA2Session ? sessionStats.mostCommonLevel : sessionStats.averageOptions}</strong>
                </article>
                <article className="stat-card">
                  <span>{isA2Session ? "Gut gelöst" : "Beste Option gespielt"}</span>
                  <strong>{isA2Session ? sessionStats.goodRate : sessionStats.playedRate}%</strong>
                </article>
              </div>

              {isSelectedSessionActive ? null : (
                <section className="timeline-card history-timeline" aria-labelledby="history-interesting-title">
                  <div className="section-heading compact-heading"><p className="eyebrow">Timeline</p><h2 id="history-interesting-title">Interessante Szenen</h2></div>
                  {interestingScenes.length ? <div className="interesting-list">{interestingScenes.map((item) => <span key={item.id}>★ {formatObservationMatchTime(item)}</span>)}</div> : <p className="empty-state">Keine interessanten Szenen markiert.</p>}
                </section>
              )}

              <div className="history-meta">
                <span>Erstellt: {formatDate(selectedSession.createdAt)}</span>
                <span>Aktualisiert: {formatDate(selectedSession.updatedAt)}</span>
                {selectedSession.endedAt ? <span>Beendet: {formatDate(selectedSession.endedAt)}</span> : null}
              </div>

              <div className="session-actions history-actions">
                {isSelectedSessionActive ? null : (
                  <button className="button button-primary" type="button" onClick={() => continueSession(selectedSession)}>
                    Session öffnen
                  </button>
                )}
                <button className="button danger-button" type="button" onClick={() => deleteSession(selectedSession)} disabled={isDeleting}>
                  {isDeleting ? "Lösche..." : "Session löschen"}
                </button>
              </div>

              <div className="log-list history-log">
                {selectedSession.observations.length ? (
                  selectedSession.observations.map((item) => {
                    const isA2Item = item.track === "A2" || Boolean(item.pressureLevel);
                    return (
                      <article className={item.isInteresting ? "log-item interesting" : "log-item"} key={item.id}>
                        <time>{item.isInteresting ? "★ " : ""}{formatObservationMatchTime(item)}</time>
                        {isA2Item ? (
                          <>
                            <p>Druck: {item.pressureLevel ?? "-"}</p>
                            <p>Richtung: {item.pressureDirection ?? "-"}</p>
                            <p>Zeitfenster: {item.timeWindow ?? "-"}</p>
                            <p>Lösung: {item.solutionQuality ?? "-"}</p>
                            <p>Ergebnis: {item.outcome}</p>
                          </>
                        ) : (
                          <>
                            <p>Optionen: {item.optionCount}</p>
                            <p>Beste Option: {item.bestOption}</p>
                            <p>Gespielt: {item.played}</p>
                            <p>Ergebnis: {item.outcome}</p>
                          </>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <p className="empty-state">Diese Session hat noch keine Beobachtungen.</p>
                )}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
