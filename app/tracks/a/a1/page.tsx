"use client";

import { useEffect, useMemo, useState } from "react";
import worldCup2026 from "@/data/world-cup-2026.json";

type OptionCount = "1" | "2" | "3" | "4" | "5+";
type BestOption = "Sicherheit" | "Raumgewinn" | "Progression" | "Seitenwechsel" | "Durchbruch";
type Played = "Ja" | "Nein" | "Unsicher";
type Outcome = "Ballbesitz gehalten" | "Raumgewinn" | "Druck aufgelöst" | "Ballverlust" | "Torchance";
type FocusPerspective = "Beide Teams" | "Team A" | "Team B";

type AccountUser = { id: string; profileId: string; profileName: string; email: string; createdAt: string };

type Observation = {
  id: string;
  time: string;
  matchTime: string;
  optionCount: OptionCount;
  bestOption: BestOption;
  played: Played;
  outcome: Outcome;
  isInteresting: boolean;
};

type StoredSession = {
  id: string;
  profileId: string;
  profileName: string;
  competition: string;
  teamA: string;
  teamB: string;
  focusTeam: string;
  focusPerspective: FocusPerspective;
  phase: string;
  track: string;
  trackTitle: string;
  sessionName: string;
  sessionStartMatchTime: string;
  sessionStartTimestamp: string;
  matchTimeCorrectionSeconds?: number;
  isMatchClockPaused?: boolean;
  matchClockPausedSeconds?: number | null;
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

const competitions = ["WM 2026", "EM", "Champions League", "Europa League", "Conference League", "Bundesliga", "2. Bundesliga", "3. Liga", "Premier League", "La Liga", "Serie A", "Ligue 1", "Sonstige"];
const focusTracks = [{ code: "A1", title: "Anspielbarkeit beobachten" }];
const phaseExamples = ["Gruppenphase Spieltag 1", "Gruppenphase Spieltag 2", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale", "34. Spieltag"];
const optionCounts: OptionCount[] = ["1", "2", "3", "4", "5+"];
const bestOptions: BestOption[] = ["Sicherheit", "Raumgewinn", "Progression", "Seitenwechsel", "Durchbruch"];
const playedOptions: Played[] = ["Ja", "Nein", "Unsicher"];
const outcomes: Outcome[] = ["Ballbesitz gehalten", "Raumgewinn", "Druck aufgelöst", "Ballverlust", "Torchance"];
const optionValues: Record<OptionCount, number> = { "1": 1, "2": 2, "3": 3, "4": 4, "5+": 5 };

const categoryHelp: Record<BestOption, { text: string; example: string }> = {
  Sicherheit: { text: "Ball sichern und Risiko vermeiden.", example: "Pass zurück zum Torwart oder Innenverteidiger." },
  Raumgewinn: { text: "Freien Raum bespielen oder nutzen.", example: "Pass auf den Außenverteidiger mit viel Platz." },
  Progression: { text: "Das Spiel nach vorne entwickeln und Linien überspielen.", example: "Pass auf den Sechser zwischen den gegnerischen Reihen." },
  Seitenwechsel: { text: "Spiel auf die andere Feldseite verlagern.", example: "Von einer zugestellten Seite auf die freie Seite wechseln." },
  Durchbruch: { text: "Direkter Angriff auf die gegnerische Struktur.", example: "Steckpass hinter die Abwehrkette oder in den Strafraum." },
};

const teamsByCompetition: Record<string, string[]> = { [worldCup2026.competition]: Object.values(worldCup2026.groups).flat() };

function getWallTime() {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function getSessionName(competition: string, teamA: string, teamB: string, track: string) {
  if (!competition || !teamA || !teamB || !track) return "Sessionname wird automatisch erzeugt";
  return `${competition} | ${teamA} – ${teamB} | ${track}`;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function normalizeTeamName(value: string) {
  return value.trim().toLocaleLowerCase("de-DE");
}

function getTeamSuggestion(value: string, options: string[]) {
  const query = normalizeTeamName(value);
  if (!query) return "";
  return options.find((team) => normalizeTeamName(team).startsWith(query)) ?? "";
}

function getTeamMatches(value: string, options: string[]) {
  const query = normalizeTeamName(value);
  if (!query) return options.slice(0, 8);
  return options.filter((team) => normalizeTeamName(team).includes(query)).slice(0, 8);
}

function parseMatchTime(value: string) {
  const match = value.trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function maskMatchTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 5);
  if (!digits) return "00:00";
  const seconds = digits.slice(-2).padStart(2, "0");
  const minuteDigits = digits.length > 2 ? digits.slice(0, -2) : "0";
  return `${String(Number(minuteDigits)).padStart(2, "0")}:${seconds}`;
}

function formatCorrectionOffset(totalSeconds: number) {
  const sign = totalSeconds < 0 ? "-" : "+";
  const absoluteSeconds = Math.abs(totalSeconds);
  const minutes = Math.floor(absoluteSeconds / 60);
  const seconds = absoluteSeconds % 60;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMatchTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getCurrentMatchSeconds(session: StoredSession | null, nowMs: number) {
  if (!session) return 0;
  const startSeconds = parseMatchTime(session.sessionStartMatchTime || "00:00") ?? 0;
  if (session.isMatchClockPaused && typeof session.matchClockPausedSeconds === "number") {
    return Math.max(0, session.matchClockPausedSeconds);
  }
  const startedAt = Date.parse(session.sessionStartTimestamp || session.createdAt);
  const elapsedSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((nowMs - startedAt) / 1000)) : 0;
  const correctionSeconds = session.matchTimeCorrectionSeconds ?? 0;
  return Math.max(0, startSeconds + elapsedSeconds + correctionSeconds);
}

function getCurrentMatchTime(session: StoredSession | null, nowMs: number) {
  return formatMatchTime(getCurrentMatchSeconds(session, nowMs));
}

function getHalfLabel(matchTime: string) {
  const seconds = parseMatchTime(matchTime) ?? 0;
  return seconds >= 45 * 60 ? "2. Halbzeit" : "1. Halbzeit";
}

function cacheSession(session: StoredSession) {
  const cached = localStorage.getItem(SESSION_CACHE_KEY);
  const sessions = cached ? (JSON.parse(cached) as StoredSession[]) : [];
  const nextSessions = [session, ...sessions.filter((item) => item.id !== session.id)];
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(nextSessions));
}

export default function A1TrackPage() {
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [activeSession, setActiveSession] = useState<StoredSession | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isSessionGuardOpen, setIsSessionGuardOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const [competition, setCompetition] = useState("WM 2026");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [focusPerspective, setFocusPerspective] = useState<FocusPerspective>("Team A");
  const [phase, setPhase] = useState("Gruppenphase Spieltag 1");
  const [selectedTrack, setSelectedTrack] = useState("A1");
  const [sessionStartMatchTime, setSessionStartMatchTime] = useState("00:00");

  const [optionCount, setOptionCount] = useState<OptionCount>("3");
  const [bestOption, setBestOption] = useState<BestOption>("Raumgewinn");
  const [played, setPlayed] = useState<Played>("Ja");
  const [outcome, setOutcome] = useState<Outcome>("Ballbesitz gehalten");
  const [isInteresting, setIsInteresting] = useState(false);
  const [capturedMatchTime, setCapturedMatchTime] = useState("00:00");
  const [editingObservationId, setEditingObservationId] = useState<string | null>(null);
  const [isCorrectingTime, setIsCorrectingTime] = useState(false);
  const [focusedTeamField, setFocusedTeamField] = useState<"teamA" | "teamB" | null>(null);
  const [timeCorrectionMessage, setTimeCorrectionMessage] = useState("");
  const [jumpMatchTime, setJumpMatchTime] = useState("00:00");

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadActiveSessionFromServer(storedToken: string) {
    const sessionsResponse = await fetch("/api/sessions", { headers: authHeaders(storedToken) });
    if (!sessionsResponse.ok) return null;
    const sessions = (await sessionsResponse.json()) as StoredSession[];
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(sessions));
    const serverActiveSession = sessions.find((session) => (session.status ?? "active") === "active") ?? null;
    if (serverActiveSession) {
      localStorage.setItem(ACTIVE_SESSION_KEY, serverActiveSession.id);
      setActiveSession(serverActiveSession);
      cacheSession(serverActiveSession);
    }
    return serverActiveSession;
  }

  useEffect(() => {
    async function loadAccountAndSession() {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
      setToken(storedToken);
      if (!storedToken) return;

      try {
        const meResponse = await fetch("/api/me", { headers: authHeaders(storedToken) });
        if (!meResponse.ok) throw new Error("Bitte erneut einloggen.");
        const user = (await meResponse.json()) as AccountUser;
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(user));
        setAccount(user);

        if (activeSessionId) {
          const sessionResponse = await fetch(`/api/sessions/${activeSessionId}`, { headers: authHeaders(storedToken) });
          if (sessionResponse.ok) {
            const loadedSession = (await sessionResponse.json()) as StoredSession;
            if ((loadedSession.status ?? "active") === "active") {
              setActiveSession(loadedSession);
              cacheSession(loadedSession);
            } else {
              localStorage.removeItem(ACTIVE_SESSION_KEY);
              await loadActiveSessionFromServer(storedToken);
            }
          } else {
            localStorage.removeItem(ACTIVE_SESSION_KEY);
            await loadActiveSessionFromServer(storedToken);
          }
        } else {
          await loadActiveSessionFromServer(storedToken);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Account konnte nicht geladen werden.");
      }
    }
    loadAccountAndSession();
  }, []);

  const observations = activeSession?.observations ?? [];
  const interestingObservations = observations.filter((item) => item.isInteresting);
  const teamOptions = teamsByCompetition[competition] ?? [];
  const trackMeta = focusTracks.find((track) => track.code === selectedTrack) ?? focusTracks[0];
  const sessionName = getSessionName(competition, teamA, teamB, selectedTrack);
  const focusTeam = focusPerspective === "Team A" ? teamA : focusPerspective === "Team B" ? teamB : "Beide Teams";
  const matchClock = getCurrentMatchTime(activeSession, nowMs);
  const matchClockSeconds = getCurrentMatchSeconds(activeSession, nowMs);
  const timeCorrectionSeconds = activeSession?.matchTimeCorrectionSeconds ?? 0;
  const isMatchClockPaused = Boolean(activeSession?.isMatchClockPaused);
  const teamASuggestion = getTeamSuggestion(teamA, teamOptions);
  const teamBSuggestion = getTeamSuggestion(teamB, teamOptions);
  const teamAMatches = getTeamMatches(teamA, teamOptions);
  const teamBMatches = getTeamMatches(teamB, teamOptions);
  const isTeamAValid = teamOptions.includes(teamA);
  const isTeamBValid = teamOptions.includes(teamB);
  const canCreateSession = Boolean(token && account && competition && teamA && teamB && isTeamAValid && isTeamBValid && focusPerspective && selectedTrack && parseMatchTime(sessionStartMatchTime) !== null);

  const stats = useMemo(() => {
    const playedDecisions = observations.filter((item) => item.played !== "Unsicher");
    const playedYes = playedDecisions.filter((item) => item.played === "Ja").length;
    const averageOptions = observations.length ? observations.reduce((sum, item) => sum + optionValues[item.optionCount], 0) / observations.length : 0;
    return { count: observations.length, averageOptions: observations.length ? averageOptions.toFixed(1) : "0", playedRate: playedDecisions.length ? Math.round((playedYes / playedDecisions.length) * 100) : 0 };
  }, [observations]);

  function openSetup() {
    setError("");
    if (activeSession && (activeSession.status ?? "active") === "active") {
      setIsSessionGuardOpen(true);
      setIsSetupOpen(false);
      setIsFormOpen(false);
      return;
    }
    setIsSetupOpen(true);
    setIsFormOpen(false);
  }

  async function finishSession(nextStatus: "completed" | "abandoned") {
    if (!activeSession || !token) return;
    if (nextStatus === "completed" && !window.confirm("Möchtest du diese Session abschließen? Danach wird sie im Session-Verlauf gespeichert.")) return;
    if (nextStatus === "abandoned" && !window.confirm("Diese Session und alle Beobachtungen werden verworfen. Wirklich fortfahren?")) return;

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error("Session konnte nicht aktualisiert werden.");
      const updatedSession = (await response.json()) as StoredSession;
      cacheSession(updatedSession);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      setActiveSession(null);
      setIsFormOpen(false);
      setIsSetupOpen(false);
      setIsSessionGuardOpen(false);
      window.location.href = "/sessions";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Session konnte nicht aktualisiert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateCompetition(value: string) {
    setCompetition(value);
    setTeamA("");
    setTeamB("");
    setFocusPerspective("Beide Teams");
  }

  function resetObservationDraft() {
    setOptionCount("3");
    setBestOption("Raumgewinn");
    setPlayed("Ja");
    setOutcome("Ballbesitz gehalten");
    setIsInteresting(false);
    setEditingObservationId(null);
  }

  function toggleObservationForm() {
    if (!activeSession) return;
    if (isFormOpen) {
      setIsFormOpen(false);
      resetObservationDraft();
      return;
    }
    resetObservationDraft();
    setCapturedMatchTime(matchClock);
    setIsFormOpen(true);
  }

  function startEditingObservation(observation: Observation) {
    setEditingObservationId(observation.id);
    setCapturedMatchTime(observation.matchTime || observation.time);
    setOptionCount(observation.optionCount);
    setBestOption(observation.bestOption);
    setPlayed(observation.played);
    setOutcome(observation.outcome);
    setIsInteresting(observation.isInteresting);
    setIsFormOpen(true);
  }

  async function createSession() {
    if (!canCreateSession || !token) return;
    setIsSaving(true);
    setError("");
    const sessionStartTimestamp = new Date().toISOString();

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ competition, teamA, teamB, focusTeam, focusPerspective, phase, track: selectedTrack, trackTitle: trackMeta.title, sessionName, sessionStartMatchTime, sessionStartTimestamp, matchTimeCorrectionSeconds: 0, isMatchClockPaused: false, matchClockPausedSeconds: null }),
      });
      if (response.status === 409) {
        const serverActiveSession = await loadActiveSessionFromServer(token);
        if (serverActiveSession) setIsSessionGuardOpen(true);
        throw new Error("Es läuft bereits eine aktive Session.");
      }
      if (!response.ok) throw new Error("Session konnte nicht erstellt werden.");
      const session = (await response.json()) as StoredSession;
      setActiveSession(session);
      cacheSession(session);
      setNowMs(Date.now());
      localStorage.setItem(ACTIVE_SESSION_KEY, session.id);
      setIsSetupOpen(false);
      setIsFormOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Session konnte nicht erstellt werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTimeline(
    payload: { matchTimeCorrectionSeconds?: number; isMatchClockPaused?: boolean; matchClockPausedSeconds?: number | null },
    successMessage: string
  ) {
    if (!activeSession || !token) return;
    setIsCorrectingTime(true);
    setTimeCorrectionMessage("");
    setError("");

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/timeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Spielzeit konnte nicht aktualisiert werden.");
      const session = (await response.json()) as StoredSession;
      const timestampMs = Date.now();
      setActiveSession(session);
      cacheSession(session);
      setNowMs(timestampMs);
      setJumpMatchTime(formatMatchTime(getCurrentMatchSeconds(session, timestampMs)));
      setTimeCorrectionMessage(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Spielzeit konnte nicht aktualisiert werden.");
    } finally {
      setIsCorrectingTime(false);
    }
  }

  function getCorrectionForTarget(targetSeconds: number, timestampMs: number) {
    if (!activeSession) return 0;
    const startSeconds = parseMatchTime(activeSession.sessionStartMatchTime || "00:00") ?? 0;
    const startedAt = Date.parse(activeSession.sessionStartTimestamp || activeSession.createdAt);
    const elapsedSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((timestampMs - startedAt) / 1000)) : 0;
    return targetSeconds - startSeconds - elapsedSeconds;
  }

  function updateTimeCorrection(deltaSeconds: number) {
    if (!activeSession) return;
    const targetSeconds = Math.max(0, matchClockSeconds + deltaSeconds);
    if (isMatchClockPaused) {
      updateTimeline(
        { matchClockPausedSeconds: targetSeconds },
        `Pausierte Spielzeit auf ${formatMatchTime(targetSeconds)} gesetzt.`
      );
      return;
    }
    const nextCorrectionSeconds = timeCorrectionSeconds + deltaSeconds;
    updateTimeline(
      { matchTimeCorrectionSeconds: nextCorrectionSeconds },
      `Korrektur ${formatCorrectionOffset(nextCorrectionSeconds)} aktiv.`
    );
  }

  function toggleMatchClockPause() {
    if (!activeSession) return;
    const timestampMs = Date.now();
    if (isMatchClockPaused) {
      const resumeSeconds = activeSession.matchClockPausedSeconds ?? matchClockSeconds;
      const nextCorrectionSeconds = getCorrectionForTarget(resumeSeconds, timestampMs);
      updateTimeline(
        { matchTimeCorrectionSeconds: nextCorrectionSeconds, isMatchClockPaused: false, matchClockPausedSeconds: null },
        `Spielzeit läuft weiter ab ${formatMatchTime(resumeSeconds)}.`
      );
      return;
    }
    updateTimeline(
      { isMatchClockPaused: true, matchClockPausedSeconds: matchClockSeconds },
      `Spielzeit bei ${formatMatchTime(matchClockSeconds)} pausiert.`
    );
  }

  function jumpToMatchTime() {
    if (!activeSession) return;
    const targetSeconds = parseMatchTime(jumpMatchTime);
    if (targetSeconds === null) {
      setError("Bitte gib die Spielzeit im Format mm:ss ein.");
      return;
    }
    if (isMatchClockPaused) {
      updateTimeline(
        { matchClockPausedSeconds: targetSeconds },
        `Pausierte Spielzeit auf ${formatMatchTime(targetSeconds)} gesetzt.`
      );
      return;
    }
    const nextCorrectionSeconds = getCorrectionForTarget(targetSeconds, Date.now());
    updateTimeline(
      { matchTimeCorrectionSeconds: nextCorrectionSeconds },
      `Spielzeit auf ${formatMatchTime(targetSeconds)} gesetzt.`
    );
  }

  async function saveObservation() {
    if (!activeSession || !token) return;
    setIsSaving(true);
    setError("");
    const isEditing = Boolean(editingObservationId);

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/observations${editingObservationId ? `/${editingObservationId}` : ""}`, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ time: getWallTime(), matchTime: capturedMatchTime, optionCount, bestOption, played, outcome, isInteresting }),
      });
      if (!response.ok) throw new Error(isEditing ? "Beobachtung konnte nicht aktualisiert werden." : "Beobachtung konnte nicht gespeichert werden.");
      const session = (await response.json()) as StoredSession;
      setActiveSession(session);
      cacheSession(session);
      resetObservationDraft();
      setIsFormOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Beobachtung konnte nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteObservation(observation: Observation) {
    if (!activeSession || !token) return;
    if (!window.confirm(`Beobachtung bei ${observation.matchTime || observation.time} wirklich löschen?`)) return;
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/observations/${observation.id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!response.ok) throw new Error("Beobachtung konnte nicht gelöscht werden.");
      const session = (await response.json()) as StoredSession;
      setActiveSession(session);
      cacheSession(session);
      if (editingObservationId === observation.id) {
        resetObservationDraft();
        setIsFormOpen(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Beobachtung konnte nicht gelöscht werden.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="track-shell">
      <header className="track-topbar">
        <a className="brand" href="/" aria-label="Zur Pitch-Tank-Startseite"><span className="brand-mark" aria-hidden="true">PT</span><span>Pitch Tank</span></a>
        <nav className="nav-links" aria-label="Track-Navigation"><a href="/account">Account</a><a href="/sessions">Verlauf</a><a href="/#lernpfade">Lernpfade</a></nav>
      </header>

      <section className="track-hero" aria-labelledby="track-title"><p className="eyebrow">Track A · Session 1</p><h1 id="track-title">A1 – Anspielbarkeit beobachten</h1><p>Lerne, Optionen des Ballführers bewusster wahrzunehmen.</p></section>

      <div className="track-layout">
        <div className="track-main">
          {!account ? <section className="account-required-card" aria-labelledby="account-required-title"><p className="eyebrow">Profil fehlt</p><h2 id="account-required-title">Erstelle zuerst dein Profil</h2><p>Sessions und Beobachtungen werden jetzt im Backend gespeichert und deinem Account zugeordnet.</p><a className="button button-primary" href="/account">Profil erstellen oder einloggen</a></section> : null}
          {error ? <section className="account-required-card"><p className="account-error">{error}</p></section> : null}

          {activeSession ? (
            <section className="active-session-card" aria-labelledby="active-session-title">
              <p className="eyebrow">Aktive Session</p><h2 id="active-session-title">{activeSession.sessionName}</h2>
              <div className="active-session-grid"><span>{activeSession.competition}</span><span>{activeSession.teamA} – {activeSession.teamB}</span><span>{activeSession.phase || "Phase nicht gesetzt"}</span><span>Fokus: {activeSession.focusTeam}</span><span>Track: {activeSession.track} – {activeSession.trackTitle}</span><span>Aktuelle Spielzeit: {matchClock}</span><span>Status: {isMatchClockPaused ? "pausiert" : (activeSession.status ?? "active") === "active" ? "aktiv" : activeSession.status}</span></div><div className="session-actions"><button className="button button-secondary" type="button" onClick={() => finishSession("completed")} disabled={isSaving}>Session abschließen</button></div>
            </section>
          ) : null}

          {activeSession ? <section className="match-clock-card" aria-label="Laufende Match-Uhr"><p>{activeSession.competition}</p><h2>{activeSession.teamA} – {activeSession.teamB}</h2><span>{isMatchClockPaused ? "Uhr pausiert" : getHalfLabel(matchClock)}</span><strong>{matchClock}</strong><button className="button button-secondary match-clock-toggle" type="button" onClick={toggleMatchClockPause} disabled={isCorrectingTime}>{isMatchClockPaused ? "Weiterlaufen lassen" : "Zeit pausieren"}</button></section> : null}

          <section className="lesson-box" aria-labelledby="goal-title"><h2 id="goal-title">Lernziel</h2><p>In diesem Track beobachtest du während eines echten Fußballspiels die Optionen des Ballführers.</p><p>Ziel ist es, immer schneller zu erkennen:</p><ul><li>Wer ist anspielbar?</li><li>Wie viele Optionen gibt es?</li><li>Welche Option wäre die beste?</li></ul></section>

          <section className="guide-card" aria-labelledby="how-a1-title"><p className="eyebrow">Anleitung</p><h2 id="how-a1-title">Wie funktioniert A1?</h2><p>A1 trainiert deine Fähigkeit, Anspieloptionen des Ballführers bewusst wahrzunehmen.</p><p>Während eines echten Spiels beobachtest du Situationen, in denen ein Spieler den Ball kontrolliert erhält und eine Entscheidung treffen kann.</p><p>Deine Aufgabe ist nicht, den Ball zu verfolgen, sondern die verfügbaren Optionen zu erkennen.</p></section>

          <section className="guide-card" aria-labelledby="when-observe-title"><p className="eyebrow">Auslöser</p><h2 id="when-observe-title">Wann sollte ich eine Beobachtung erfassen?</h2><p>Erfasse eine Beobachtung, wenn ein Spieler den Ball kontrolliert erhält und mindestens kurz Zeit hat, eine Entscheidung zu treffen.</p><div className="guide-columns"><div><h3>Geeignete Situationen</h3><ul><li>Innenverteidiger erhält den Ball im Aufbau</li><li>Außenverteidiger wird angespielt</li><li>Sechser erhält den Ball zwischen den Linien</li><li>Flügelspieler nimmt einen Pass an</li></ul></div><div><h3>Weniger geeignete Situationen</h3><ul><li>Kopfballduelle</li><li>Pressschläge</li><li>Zufallsbälle</li><li>abgefälschte Aktionen</li><li>Situationen ohne erkennbare Entscheidungsoption</li></ul></div></div></section>

          <section className="session-panel" aria-labelledby="session-title"><div><p className="eyebrow">Session</p><h2 id="session-title">Spiel vor der Beobachtung festlegen</h2><p>Erfasse Wettbewerb, Teams, Fokus und die aktuelle Spielzeit. Eine aktive Session muss erst abgeschlossen oder bewusst verworfen werden.</p>{activeSession ? <span className="session-id">Session-ID: {activeSession.id}</span> : null}</div><button className="button button-primary" type="button" onClick={openSetup} disabled={!account}>{activeSession ? "Neue Session starten" : "Session starten"}</button></section>

          {isSessionGuardOpen && activeSession ? (
            <section className="session-guard-card" aria-labelledby="session-guard-title">
              <p className="eyebrow">Aktive Session läuft</p>
              <h2 id="session-guard-title">Es läuft bereits eine aktive Session.</h2>
              <p>Du kannst zur aktiven Session zurückkehren, sie sauber abschließen oder sie bewusst verwerfen. Eine neue Session überschreibt niemals still die laufende Session.</p>
              <div className="session-guard-meta">
                <strong>{activeSession.sessionName}</strong>
                <span>{activeSession.observations.length} Beobachtungen gespeichert</span>
              </div>
              <div className="session-actions">
                <button className="button button-primary" type="button" onClick={() => setIsSessionGuardOpen(false)}>Zur aktiven Session</button>
                <button className="button button-secondary" type="button" onClick={() => finishSession("completed")} disabled={isSaving}>Session abschließen</button>
                <button className="button danger-button" type="button" onClick={() => finishSession("abandoned")} disabled={isSaving}>Session verwerfen</button>
              </div>
            </section>
          ) : null}

          {isSetupOpen ? (
            <section className="setup-card" aria-labelledby="setup-title"><div className="section-heading compact-heading"><p className="eyebrow">Session-Setup</p><h2 id="setup-title">Welches Spiel beobachtest du?</h2></div>
              <form className="setup-form" onSubmit={(event) => event.preventDefault()}>
                <label className="field"><span>Wettbewerb</span><select value={competition} onChange={(event) => updateCompetition(event.target.value)} required>{competitions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <div className="field-grid"><TeamAutocomplete fieldId="team-a" label="Team A" value={teamA} onChange={setTeamA} matches={teamAMatches} suggestion={teamASuggestion} isValid={isTeamAValid} isOpen={focusedTeamField === "teamA"} onFocus={() => setFocusedTeamField("teamA")} onBlur={() => window.setTimeout(() => setFocusedTeamField((current) => current === "teamA" ? null : current), 120)} /><TeamAutocomplete fieldId="team-b" label="Team B" value={teamB} onChange={setTeamB} matches={teamBMatches} suggestion={teamBSuggestion} isValid={isTeamBValid} isOpen={focusedTeamField === "teamB"} onFocus={() => setFocusedTeamField("teamB")} onBlur={() => window.setTimeout(() => setFocusedTeamField((current) => current === "teamB" ? null : current), 120)} /></div>
                {!teamOptions.length ? <p className="form-hint">Für diesen Wettbewerb sind noch keine Teams hinterlegt. Eine Session kann erst mit hinterlegten Teams gestartet werden.</p> : <p className="form-hint">Tippe los und wähle ein Team aus den Vorschlägen. Freitext ist hier nicht gültig.</p>}
                <fieldset className="choice-group setup-choice"><legend>Welches Team beobachtest du hauptsächlich?</legend><div>{(["Beide Teams", "Team A", "Team B"] as FocusPerspective[]).map((option) => <button className={option === focusPerspective ? "choice active" : "choice"} key={option} type="button" onClick={() => setFocusPerspective(option)}>{option === "Team A" && teamA ? teamA : option === "Team B" && teamB ? teamB : option}</button>)}</div></fieldset>
                <label className="field"><span>Phase / Spieltag</span><input list="phase-examples" value={phase} onChange={(event) => setPhase(event.target.value)} placeholder="Gruppenphase Spieltag 1" /><datalist id="phase-examples">{phaseExamples.map((example) => <option key={example} value={example} />)}</datalist></label>
                <label className="field"><span>Fokus-Track</span><select value={selectedTrack} onChange={(event) => setSelectedTrack(event.target.value)} required>{focusTracks.map((track) => <option key={track.code} value={track.code}>{track.code} – {track.title}</option>)}</select></label>
                <label className="field"><span>Aktuelle Spielzeit</span><input value={sessionStartMatchTime} onChange={(event) => setSessionStartMatchTime(maskMatchTimeInput(event.target.value))} inputMode="numeric" placeholder="00:00" required /><small>Tippe nur Zahlen, zum Beispiel 5256 für 52:56. Pitch Tank verwendet diese Zeit als Startpunkt für die Session-Timeline.</small></label>
                <div className="generated-session-name"><span>Sessionname</span><strong>{sessionName}</strong></div>
                <button className="button button-primary" type="button" onClick={createSession} disabled={!canCreateSession || isSaving}>{isSaving ? "Speichere..." : "Setup abschließen und Session starten"}</button>
              </form>
            </section>
          ) : null}

          <section className="stats-grid" aria-label="Live-Statistik"><article className="stat-card"><span>Beobachtungen</span><strong>{stats.count}</strong></article><article className="stat-card"><span>Durchschnittlich erkannte Optionen</span><strong>{stats.averageOptions}</strong></article><article className="stat-card"><span>Beste Option gespielt</span><strong>{stats.playedRate}%</strong></article></section>

          <section className="timeline-card" aria-labelledby="interesting-title"><div className="section-heading compact-heading"><p className="eyebrow">Timeline</p><h2 id="interesting-title">Interessante Szenen</h2></div>{interestingObservations.length ? <div className="interesting-list">{interestingObservations.map((item) => <span key={item.id}>★ {item.matchTime || item.time}</span>)}</div> : <p className="empty-state">Noch keine interessanten Szenen markiert.</p>}</section>

          <section className="observation-area" aria-labelledby="observe-title"><div className="observe-header"><div><p className="eyebrow">Beobachtung erfassen</p><h2 id="observe-title">Optionen im Spielmoment</h2></div><button className="capture-button" type="button" onClick={toggleObservationForm} disabled={!activeSession}>+ Beobachtung erfassen</button></div>
            {!activeSession ? <p className="empty-state">Schließe zuerst das Session-Setup ab, um Beobachtungen zu erfassen.</p> : null}
            {isFormOpen && activeSession ? <form className="observation-form" onSubmit={(event) => event.preventDefault()}><div className="captured-time-banner"><span>{editingObservationId ? "Bearbeitete Szenenzeit" : "Szenenzeit"}</span><strong>{capturedMatchTime}</strong><small>{editingObservationId ? "Zeitstempel des gespeicherten Eintrags." : "Fixiert beim Klick auf „Beobachtung erfassen“."}</small></div><ChoiceGroup label="Wie viele sinnvolle Optionen hatte der Ballführer?" help="Sinnvolle Optionen sind realistisch spielbare Anschlussaktionen. Zähle nicht jeden Mitspieler auf dem Feld, sondern nur Spieler oder Räume, die tatsächlich angespielt werden könnten." options={optionCounts} value={optionCount} onChange={setOptionCount} /><ChoiceGroup label="Welche Option war die beste?" help="Wähle die Option, die aus deiner Sicht den größten Mehrwert erzeugt hätte. Es geht nicht darum, was tatsächlich gespielt wurde." options={bestOptions} value={bestOption} onChange={setBestOption} /><div className="category-help-grid" aria-label="Kategorien erklärt">{bestOptions.map((option) => <article className={option === bestOption ? "category-help active" : "category-help"} key={option}><h3>{option}</h3><p>{categoryHelp[option].text}</p><small>Beispiel: {categoryHelp[option].example}</small></article>)}</div><ChoiceGroup label="Wurde diese Option gespielt?" help="Vergleiche deine Einschätzung mit der tatsächlichen Entscheidung des Spielers." options={playedOptions} value={played} onChange={setPlayed} /><ChoiceGroup label="Wie endete die Aktion?" help="Bewerte das unmittelbare Ergebnis der gewählten Aktion." options={outcomes} value={outcome} onChange={setOutcome} /><label className="checkbox-field"><input type="checkbox" checked={isInteresting} onChange={(event) => setIsInteresting(event.target.checked)} /> <span>Besonders interessante Szene</span></label><div className="observation-form-actions"><button className="button button-primary" type="button" onClick={saveObservation} disabled={isSaving}>{isSaving ? "Speichere..." : editingObservationId ? "Änderung speichern" : "Beobachtung speichern"}</button>{editingObservationId ? <button className="button button-secondary" type="button" onClick={() => { resetObservationDraft(); setIsFormOpen(false); }} disabled={isSaving}>Bearbeitung abbrechen</button> : null}</div></form> : null}
          </section>

          <section className="session-log" aria-labelledby="log-title"><div className="section-heading compact-heading"><p className="eyebrow">Session-Log</p><h2 id="log-title">Gespeicherte Beobachtungen</h2></div>{observations.length ? <div className="log-list">{observations.map((item) => <article className={item.isInteresting ? "log-item interesting" : "log-item"} key={item.id}><time>{item.isInteresting ? "★ " : ""}{item.matchTime || item.time}</time><p>Optionen: {item.optionCount}</p><p>Beste Option: {item.bestOption}</p><p>Gespielt: {item.played}</p><p>Ergebnis: {item.outcome}</p><div className="log-actions"><button type="button" onClick={() => startEditingObservation(item)} disabled={isSaving}>Bearbeiten</button><button type="button" onClick={() => deleteObservation(item)} disabled={isSaving}>Löschen</button></div></article>)}</div> : <p className="empty-state">Noch keine Beobachtungen gespeichert.</p>}</section>
        </div>

        <aside className="observation-flow" aria-labelledby="flow-title"><p className="eyebrow">Lernhilfe</p><h2 id="flow-title">Beobachtungsablauf</h2><ol><li>Spieler erhält den Ball.</li><li>Optionen erkennen.</li><li>Beste Option bestimmen.</li><li>Tatsächliche Entscheidung vergleichen.</li><li>Ergebnis bewerten.</li></ol><div className="time-correction-note time-correction-form"><strong>Spielzeit steuern</strong><span>{isMatchClockPaused ? "Uhr pausiert" : "Uhr läuft"} · Korrektur <b>{formatCorrectionOffset(timeCorrectionSeconds)}</b></span><button className="time-pause-button" type="button" onClick={toggleMatchClockPause} disabled={!activeSession || isCorrectingTime}>{isMatchClockPaused ? "Weiter" : "Pause"}</button><div className="time-jump-control"><input aria-label="Spielzeit im Format mm:ss" value={jumpMatchTime} onChange={(event) => setJumpMatchTime(maskMatchTimeInput(event.target.value))} onFocus={() => setJumpMatchTime(matchClock)} inputMode="numeric" placeholder="45:00" disabled={!activeSession || isCorrectingTime} /><button type="button" onClick={jumpToMatchTime} disabled={!activeSession || isCorrectingTime}>Setzen</button></div><div className="time-correction-buttons" role="group" aria-label="Spielzeit in Sekunden korrigieren"><button type="button" onClick={() => updateTimeCorrection(-2)} disabled={!activeSession || isCorrectingTime}>-2s</button><button type="button" onClick={() => updateTimeCorrection(-1)} disabled={!activeSession || isCorrectingTime}>-1s</button><button type="button" onClick={() => updateTimeCorrection(1)} disabled={!activeSession || isCorrectingTime}>+1s</button><button type="button" onClick={() => updateTimeCorrection(2)} disabled={!activeSession || isCorrectingTime}>+2s</button></div>{timeCorrectionMessage ? <small>{timeCorrectionMessage}</small> : null}</div></aside>
      </div>
    </main>
  );
}

function ChoiceGroup<T extends string>({ label, help, options, value, onChange }: { label: string; help?: string; options: T[]; value: T; onChange: (value: T) => void }) {
  return <fieldset className="choice-group"><legend>{label}</legend>{help ? <p className="choice-help">{help}</p> : null}<div>{options.map((option) => <button className={option === value ? "choice active" : "choice"} key={option} type="button" onClick={() => onChange(option)}>{option}</button>)}</div></fieldset>;
}


function TeamAutocomplete({ fieldId, label, value, onChange, matches, suggestion, isValid, isOpen, onFocus, onBlur }: { fieldId: string; label: string; value: string; onChange: (value: string) => void; matches: string[]; suggestion: string; isValid: boolean; isOpen: boolean; onFocus: () => void; onBlur: () => void }) {
  const completionHint = value && suggestion && suggestion !== value ? suggestion : "";

  function completeSuggestion() {
    if (suggestion) onChange(suggestion);
  }

  return (
    <label className="field team-autocomplete-field" htmlFor={fieldId}>
      <span>{label}</span>
      <div className="team-autocomplete-shell">
        <input
          id={fieldId}
          className={value && !isValid ? "invalid-input" : undefined}
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === "Tab" && suggestion && suggestion !== value) {
              event.preventDefault();
              completeSuggestion();
            }
          }}
          placeholder="Team suchen und auswählen"
          required
        />
      </div>
      {completionHint ? <small className="team-completion-hint">Tab übernimmt: {completionHint}</small> : null}
      {isOpen && matches.length ? (
        <div className="team-suggestion-list">
          {matches.map((team) => (
            <button key={team} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange(team)}>
              {team}
            </button>
          ))}
        </div>
      ) : null}
      {value && !isValid ? <small className="field-error">Bitte ein Team aus der Liste auswählen.</small> : null}
    </label>
  );
}
