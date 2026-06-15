"use client";

import { useEffect, useMemo, useState } from "react";

type AccountUser = {
  id: string;
  profileId: string;
  profileName: string;
  email: string;
  createdAt: string;
};

type Observation = {
  id: string;
  time: string;
  optionCount: "1" | "2" | "3" | "4" | "5+";
  bestOption: string;
  played: string;
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
  createdAt: string;
  updatedAt: string;
  observations: Observation[];
};

const TOKEN_STORAGE_KEY = "pitch-tank.token";
const ACCOUNT_STORAGE_KEY = "pitch-tank.account";
const ACTIVE_SESSION_KEY = "pitch-tank.activeSessionId";

const optionValues: Record<Observation["optionCount"], number> = {
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

export default function SessionsPage() {
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const sessionStats = useMemo(() => {
    if (!selectedSession) {
      return { observations: 0, averageOptions: "0", playedRate: 0 };
    }

    const playedDecisions = selectedSession.observations.filter((item) => item.played !== "Unsicher");
    const playedYes = playedDecisions.filter((item) => item.played === "Ja").length;
    const averageOptions = selectedSession.observations.length
      ? selectedSession.observations.reduce((sum, item) => sum + optionValues[item.optionCount], 0) /
        selectedSession.observations.length
      : 0;

    return {
      observations: selectedSession.observations.length,
      averageOptions: selectedSession.observations.length ? averageOptions.toFixed(1) : "0",
      playedRate: playedDecisions.length ? Math.round((playedYes / playedDecisions.length) * 100) : 0,
    };
  }, [selectedSession]);

  function continueSession(sessionId: string) {
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    window.location.href = "/tracks/a/a1";
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
          <a href="/">Startseite</a>
        </nav>
      </header>

      <section className="account-hero" aria-labelledby="history-title">
        <p className="eyebrow">Verlauf</p>
        <h1 id="history-title">Deine gespeicherten Sessions</h1>
        <p>Alle Sessions werden im Pitch-Tank-Backend gespeichert und deinem Profil zugeordnet.</p>
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
                <small>{session.phase || "Phase nicht gesetzt"} · {session.observations.length} Beobachtungen</small>
              </button>
            ))}
          </div>

          {selectedSession ? (
            <article className="history-detail">
              <p className="eyebrow">Session</p>
              <h2>{selectedSession.sessionName}</h2>
              <div className="active-session-grid">
                <span>{selectedSession.competition}</span>
                <span>{selectedSession.teamA} – {selectedSession.teamB}</span>
                <span>{selectedSession.phase || "Phase nicht gesetzt"}</span>
                <span>Fokus: {selectedSession.focusTeam}</span>
                <span>Track: {selectedSession.track} – {selectedSession.trackTitle}</span>
              </div>

              <div className="stats-grid history-stats">
                <article className="stat-card">
                  <span>Beobachtungen</span>
                  <strong>{sessionStats.observations}</strong>
                </article>
                <article className="stat-card">
                  <span>Durchschnittlich erkannte Optionen</span>
                  <strong>{sessionStats.averageOptions}</strong>
                </article>
                <article className="stat-card">
                  <span>Beste Option gespielt</span>
                  <strong>{sessionStats.playedRate}%</strong>
                </article>
              </div>

              <div className="history-meta">
                <span>Erstellt: {formatDate(selectedSession.createdAt)}</span>
                <span>Aktualisiert: {formatDate(selectedSession.updatedAt)}</span>
              </div>

              <button className="button button-primary" type="button" onClick={() => continueSession(selectedSession.id)}>
                Session fortsetzen
              </button>

              <div className="log-list history-log">
                {selectedSession.observations.length ? (
                  selectedSession.observations.map((item) => (
                    <article className="log-item" key={item.id}>
                      <time>{item.time}</time>
                      <p>Optionen: {item.optionCount}</p>
                      <p>Beste Option: {item.bestOption}</p>
                      <p>Gespielt: {item.played}</p>
                      <p>Ergebnis: {item.outcome}</p>
                    </article>
                  ))
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
