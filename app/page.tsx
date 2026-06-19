"use client";

import { useEffect, useState } from "react";

type ActiveSession = {
  id: string;
  sessionName: string;
  competition: string;
  teamA: string;
  teamB: string;
  phase: string;
  track: string;
  trackTitle: string;
  status?: "active" | "completed" | "abandoned";
  observations: unknown[];
};

const TOKEN_STORAGE_KEY = "pitch-tank.token";
const ACTIVE_SESSION_KEY = "pitch-tank.activeSessionId";
const SESSION_CACHE_KEY = "pitchTank.sessions";

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function cacheSession(session: ActiveSession) {
  const cached = localStorage.getItem(SESSION_CACHE_KEY);
  const sessions = cached ? (JSON.parse(cached) as ActiveSession[]) : [];
  const nextSessions = [session, ...sessions.filter((item) => item.id !== session.id)];
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(nextSessions));
}

const dashboardCards = [
  {
    title: "A1 starten",
    content: "Anspielbarkeit, freie Räume und erste Optionen erkennen",
    action: "A1 öffnen",
    href: "/tracks/a/a1",
  },
  {
    title: "A2 starten",
    content: "Druck, Zeitfenster und Handlungsfreiheit des Ballführers einordnen",
    action: "A2 öffnen",
    href: "/tracks/a/a2",
  },
  {
    title: "Fortschritt",
    content: "0 Sessions abgeschlossen",
    note: "Curriculum im Aufbau",
  },
];

const tracks = [
  {
    code: "A",
    title: "Wahrnehmen & Raum lesen",
    description: "Grundordnung, offene Räume, Druck und erste Optionen erkennen.",
    lessons: [
      {
        code: "A1",
        title: "Anspielbarkeit beobachten",
        description: "Optionen des Ballführers während echter Spiele schneller erkennen.",
        href: "/tracks/a/a1",
      },
      {
        code: "A2",
        title: "Druck erkennen",
        description: "Zeit, Gegnerdruck und Handlungsfreiheit des Ballführers einordnen.",
        href: "/tracks/a/a2",
      },
    ],
  },
  {
    code: "B",
    title: "Rollen & Beziehungen",
    description:
      "Sechser, Außenverteidiger, Stürmer und Verbindungen zwischen Spielern lesen.",
    lessons: [],
  },
  {
    code: "C",
    title: "Ballbesitz & Aufbau",
    description: "Aufbaustrukturen, Passwege, Progression und Kontrolle verstehen.",
    lessons: [],
  },
  {
    code: "D",
    title: "Verteidigen & Pressing",
    description: "Kettenverhalten, Pressingtrigger, Zugriff und Absicherung erkennen.",
    lessons: [],
  },
  {
    code: "E",
    title: "Umschalten",
    description: "Ballverlust, Ballgewinn, Gegenpressing und Konterphasen analysieren.",
    lessons: [],
  },
  {
    code: "F",
    title: "Spielmodell & Analyse",
    description: "Aus einzelnen Beobachtungen ein Gesamtbild des Teams entwickeln.",
    lessons: [],
  },
];

export default function HomePage() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    async function loadActiveSession() {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (!token) return;

      try {
        if (!activeSessionId) {
          const sessionsResponse = await fetch("/api/sessions", { headers: authHeaders(token) });
          if (!sessionsResponse.ok) return;
          const sessions = (await sessionsResponse.json()) as ActiveSession[];
          localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(sessions));
          const serverActiveSession = sessions.find((session) => (session.status ?? "active") === "active") ?? null;
          if (serverActiveSession) {
            localStorage.setItem(ACTIVE_SESSION_KEY, serverActiveSession.id);
            setActiveSession(serverActiveSession);
            cacheSession(serverActiveSession);
          }
          return;
        }

        const response = await fetch(`/api/sessions/${activeSessionId}`, { headers: authHeaders(token) });
        if (!response.ok) {
          localStorage.removeItem(ACTIVE_SESSION_KEY);
        } else {
          const session = (await response.json()) as ActiveSession;
          if ((session.status ?? "active") === "active") {
            setActiveSession(session);
            cacheSession(session);
            return;
          }
          localStorage.removeItem(ACTIVE_SESSION_KEY);
        }

        const sessionsResponse = await fetch("/api/sessions", { headers: authHeaders(token) });
        if (!sessionsResponse.ok) return;
        const sessions = (await sessionsResponse.json()) as ActiveSession[];
        localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(sessions));
        const serverActiveSession = sessions.find((session) => (session.status ?? "active") === "active") ?? null;
        if (serverActiveSession) {
          localStorage.setItem(ACTIVE_SESSION_KEY, serverActiveSession.id);
          setActiveSession(serverActiveSession);
          cacheSession(serverActiveSession);
        }
      } catch {
        // Dashboard bleibt nutzbar, auch wenn der Status gerade nicht geladen werden kann.
      }
    }

    loadActiveSession();
  }, []);

  async function completeActiveSession() {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token || !activeSession) return;
    if (!window.confirm("Möchtest du diese Session abschließen? Danach wird sie im Session-Verlauf gespeichert.")) return;

    setIsCompleting(true);
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ status: "completed" }),
      });
      if (response.ok) {
        const session = (await response.json()) as ActiveSession;
        cacheSession(session);
        localStorage.removeItem(ACTIVE_SESSION_KEY);
        setActiveSession(null);
        window.location.href = "/sessions";
      }
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <main className="site-shell">
      <header className="site-header" aria-label="Hauptnavigation">
        <a className="brand" href="#top" aria-label="Pitch Tank Startseite">
          <span className="brand-mark" aria-hidden="true">PT</span>
          <span>Pitch Tank</span>
        </a>
        <nav className="nav-links" aria-label="Bereiche">
          <a href="/account">Account</a>
          <a href="#dashboard">Dashboard</a>
          <a href="#lernpfade">Lernpfade</a>
          <a href="/sessions">Sessions</a>
          <a href="#curriculum">Curriculum</a>
        </nav>
      </header>

      <section id="top" className="hero-section" aria-labelledby="hero-title">
        <div className="hero-content">
          <p className="eyebrow">Fußball-Intelligenz trainieren</p>
          <h1 id="hero-title">Räume lesen. Muster erkennen. Fußball verstehen.</h1>
          <p className="hero-copy">
            Pitch Tank ist eine Trainingsplattform für Spielverständnis: Du
            lernst, Raum, Rollen, Pressing, Umschalten und taktische Muster
            bewusster zu erkennen.
          </p>

          <div className="hero-actions" aria-label="Primäre Aktionen">
            <a className="button button-primary" href="/tracks/a/a1">
              A1 starten
            </a>
            <a className="button button-secondary" href="/tracks/a/a2">
              A2 öffnen
            </a>
            <a className="button button-secondary" href="#curriculum">
              Curriculum ansehen
            </a>
          </div>
        </div>

        <aside className="hero-board" aria-label="Nächster Trainingsfokus">
          <div className="mini-pitch" aria-hidden="true">
            <span className="zone zone-left" />
            <span className="zone zone-right" />
            <span className="player player-one" />
            <span className="player player-two" />
            <span className="player player-three" />
            <span className="player player-four" />
            <span className="ball" />
            <span className="route route-one" />
            <span className="route route-two" />
          </div>
          <div className="focus-card">
            <p className="focus-label">Nächster Fokus</p>
            <h2>Druck erkennen</h2>
            <p>Nach A1: Zeitfenster, Gegnerdruck und Handlungsfreiheit des Ballführers lesen.</p>
          </div>
        </aside>
      </section>

      <section id="dashboard" className="dashboard-section" aria-labelledby="dashboard-title">
        <div className="section-heading compact-heading">
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">Dein nächster Schritt</h2>
        </div>

        {activeSession ? (
          <div className="active-dashboard-card">
            <div>
              <p className="eyebrow">Aktive Session läuft</p>
              <h3>{activeSession.sessionName}</h3>
              <p>{activeSession.competition} · {activeSession.teamA} – {activeSession.teamB} · {activeSession.observations.length} Beobachtungen</p>
            </div>
            <div className="session-actions">
              <a className="button button-primary" href="/tracks/a/a1">A1 öffnen</a>
              <a className="button button-secondary" href="/tracks/a/a2">A2 öffnen</a>
              <button className="button button-secondary" type="button" onClick={completeActiveSession} disabled={isCompleting}>Session abschließen</button>
            </div>
          </div>
        ) : (
          <div className="dashboard-grid">
            {dashboardCards.map((card) => (
              <article className="dashboard-card" key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.content}</p>
                {card.action ? <a href={card.href}>{card.action}</a> : null}
                {card.note ? <span>{card.note}</span> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="lernpfade" className="tracks-section" aria-labelledby="tracks-title">
        <div className="section-heading">
          <p className="eyebrow">Curriculum</p>
          <h2 id="tracks-title">Lernpfade</h2>
        </div>

        <div className="track-grid">
          {tracks.map((track) => (
            <details className="track-card module-card" key={track.code}>
              <summary>
                <span className="track-code">{track.code}</span>
                <span className="module-copy">
                  <strong>{track.title}</strong>
                  <span>{track.description}</span>
                </span>
                <span className="module-toggle">Tracks anzeigen</span>
              </summary>

              <div className="lesson-list">
                {track.lessons.length ? (
                  track.lessons.map((lesson) => (
                    <a className="lesson-link" href={lesson.href} key={lesson.code}>
                      <span>{lesson.code}</span>
                      <strong>{lesson.title}</strong>
                      <small>{lesson.description}</small>
                    </a>
                  ))
                ) : (
                  <p className="lesson-empty">Tracks für dieses Modul sind im Aufbau.</p>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section id="sessions" className="sessions-section" aria-labelledby="sessions-title">
        <div className="section-heading compact-heading">
          <p className="eyebrow">Sessions</p>
          <h2 id="sessions-title">Profil zuerst anlegen</h2>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <h3>1. Account erstellen</h3>
            <p>Lege dein Profil an, damit deine Sessions dir zugeordnet werden.</p>
            <a href="/account">Jetzt Account erstellen</a>
          </article>
          <article className="dashboard-card">
            <h3>2. Session starten</h3>
            <p>Starte mit A1 oder öffne A2, sobald eine aktive Session läuft.</p>
            <a href="/tracks/a/a1">A1 öffnen</a>
            <a href="/tracks/a/a2">A2 öffnen</a>
          </article>
          <article className="dashboard-card">
            <h3>3. Fortschritt sichern</h3>
            <p>Der Account wird lokal im Browser gespeichert und bei erneutem Besuch geladen.</p>
            <span>Speicherung aktiv</span>
          </article>
        </div>
      </section>

      <section id="curriculum" className="info-section" aria-labelledby="info-title">
        <div>
          <p className="eyebrow">Methode</p>
          <h2 id="info-title">Aus Rink-Tank-Erfahrungen gelernt</h2>
        </div>
        <p>
          Pitch Tank übernimmt die klare Curriculum-Struktur, aber jeder Lernpfad
          darf eine eigene didaktische Mechanik nutzen, statt jedes Konzept in
          denselben Übungstyp zu pressen.
        </p>
      </section>
    </main>
  );
}
