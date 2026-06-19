"use client";

import { useEffect, useMemo, useState } from "react";
import { ActiveSessionHeader } from "@/components/pitch/ActiveSessionHeader";
import { CollapsibleHelp } from "@/components/pitch/CollapsibleHelp";
import { DrillCompass } from "@/components/pitch/DrillCompass";
import { ObservationTimelineItem } from "@/components/pitch/ObservationTimelineItem";
import { TimeControl } from "@/components/pitch/TimeControl";
import worldCup2026 from "@/data/world-cup-2026.json";

type PressureLevel = "gering" | "mittel" | "hoch";
type PressureDirection = "frontal" | "seitlich" | "von hinten" | "mehrere Richtungen";
type TimeWindow = "ruhig" | "kurz" | "sofortiger Handlungszwang";
type SolutionQuality = "gut gelöst" | "okay" | "erzwungen / verloren";
type PressureOutcome = "Ball gesichert" | "Druck gelöst" | "Raumgewinn" | "Ballverlust" | "Foul / Unterbrechung";
type FocusPerspective = "Beide Teams" | "Team A" | "Team B";
type MatchClockPeriod = "first" | "second";

type AccountUser = { id: string; profileId: string; profileName: string; email: string; createdAt: string };

type MatchTimeMeta = { totalSeconds: number; baseTime: string; stoppageTime: string | null; periodLabel: string };

type Observation = {
  id: string;
  time: string;
  matchTime: string;
  matchTimeMeta?: MatchTimeMeta;
  track?: string;
  pressureLevel?: PressureLevel;
  pressureDirection?: PressureDirection;
  timeWindow?: TimeWindow;
  solutionQuality?: SolutionQuality;
  outcome: PressureOutcome | string;
  isInteresting: boolean;
  createdAt?: string;
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
  matchClockPeriod?: MatchClockPeriod;
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

const pressureLevels: PressureLevel[] = ["gering", "mittel", "hoch"];
const pressureDirections: PressureDirection[] = ["frontal", "seitlich", "von hinten", "mehrere Richtungen"];
const timeWindows: TimeWindow[] = ["ruhig", "kurz", "sofortiger Handlungszwang"];
const solutionQualities: SolutionQuality[] = ["gut gelöst", "okay", "erzwungen / verloren"];
const outcomes: PressureOutcome[] = ["Ball gesichert", "Druck gelöst", "Raumgewinn", "Ballverlust", "Foul / Unterbrechung"];
const competitions = ["WM 2026", "EM", "Champions League", "Europa League", "Conference League", "Bundesliga", "2. Bundesliga", "3. Liga", "Premier League", "La Liga", "Serie A", "Ligue 1", "Sonstige"];
const phaseExamples = ["Gruppenphase Spieltag 1", "Gruppenphase Spieltag 2", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale", "34. Spieltag"];
const trackMeta = { code: "A2", title: "Druck erkennen" };
const teamsByCompetition: Record<string, string[]> = { [worldCup2026.competition]: Object.values(worldCup2026.groups).flat() };

const pressureHelp: Record<PressureLevel, string> = {
  gering: "Der Spieler hat Zeit, kann scannen und mehrere Optionen prüfen.",
  mittel: "Der Spieler hat Optionen, aber das Zeitfenster ist kurz.",
  hoch: "Der Spieler muss sofort handeln oder steht unmittelbar vor Ballverlust.",
};

const directionHelp: Record<PressureDirection, string> = {
  frontal: "Der Gegner läuft den Ballführer direkt von vorne an und nimmt Sicht oder Passweg.",
  seitlich: "Der Gegner kommt aus einem Winkel und lenkt den Spieler in eine Richtung.",
  "von hinten": "Der Spieler wird im Rücken attackiert oder bekommt Druck aus seinem toten Winkel.",
  "mehrere Richtungen": "Der Ballführer wird von mehreren Gegenspielern gleichzeitig eingeschränkt.",
};

const timeWindowHelp: Record<TimeWindow, string> = {
  ruhig: "Der Spieler kann den Ball kontrollieren, aufdrehen oder mehrere Optionen prüfen.",
  kurz: "Eine Entscheidung ist möglich, aber sie muss schnell kommen.",
  "sofortiger Handlungszwang": "Der Spieler muss direkt klären, prallen lassen, dribbeln oder sichern.",
};

const solutionHelp: Record<SolutionQuality, string> = {
  "gut gelöst": "Der Spieler findet trotz Druck eine stabile Lösung.",
  okay: "Die Lösung ist nicht perfekt, aber sie verhindert größeren Schaden.",
  "erzwungen / verloren": "Der Druck führt zu Ballverlust, Panikaktion oder unkontrollierter Klärung.",
};

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

function getMatchClockDisplay(totalSeconds: number, period: MatchClockPeriod = "first") {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const firstHalfEnd = 45 * 60;
  const secondHalfEnd = 90 * 60;

  if (period === "second") {
    if (safeSeconds >= secondHalfEnd) {
      return { baseTime: "90:00", stoppageTime: formatCorrectionOffset(safeSeconds - secondHalfEnd), label: "2. Halbzeit" };
    }
    return { baseTime: formatMatchTime(safeSeconds), stoppageTime: null, label: "2. Halbzeit" };
  }

  if (safeSeconds >= firstHalfEnd) {
    return { baseTime: "45:00", stoppageTime: formatCorrectionOffset(safeSeconds - firstHalfEnd), label: "1. Halbzeit" };
  }

  return { baseTime: formatMatchTime(safeSeconds), stoppageTime: null, label: "1. Halbzeit" };
}

function formatMatchClockLabel(totalSeconds: number, period: MatchClockPeriod = "first") {
  const display = getMatchClockDisplay(totalSeconds, period);
  return display.stoppageTime ? display.baseTime + " " + display.stoppageTime : display.baseTime;
}

function getMatchTimeMeta(totalSeconds: number, period: MatchClockPeriod = "first"): MatchTimeMeta {
  const display = getMatchClockDisplay(totalSeconds, period);
  return {
    totalSeconds: Math.max(0, Math.floor(totalSeconds)),
    baseTime: display.baseTime,
    stoppageTime: display.stoppageTime,
    periodLabel: display.label,
  };
}

function cacheSession(session: StoredSession) {
  const cached = localStorage.getItem(SESSION_CACHE_KEY);
  const sessions = cached ? (JSON.parse(cached) as StoredSession[]) : [];
  const nextSessions = [session, ...sessions.filter((item) => item.id !== session.id)];
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(nextSessions));
}

function isA2Observation(observation: Observation) {
  return observation.track === "A2" || Boolean(observation.pressureLevel || observation.pressureDirection || observation.timeWindow || observation.solutionQuality);
}

export default function A2TrackPage() {
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [activeSession, setActiveSession] = useState<StoredSession | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isLearningHelpOpen, setIsLearningHelpOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const [competition, setCompetition] = useState("WM 2026");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [focusPerspective, setFocusPerspective] = useState<FocusPerspective>("Team A");
  const [phase, setPhase] = useState("Gruppenphase Spieltag 1");
  const [sessionStartMatchTime, setSessionStartMatchTime] = useState("00:00");

  const [pressureLevel, setPressureLevel] = useState<PressureLevel>("mittel");
  const [pressureDirection, setPressureDirection] = useState<PressureDirection>("seitlich");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("kurz");
  const [solutionQuality, setSolutionQuality] = useState<SolutionQuality>("okay");
  const [outcome, setOutcome] = useState<PressureOutcome>("Druck gelöst");
  const [isInteresting, setIsInteresting] = useState(false);
  const [capturedMatchTime, setCapturedMatchTime] = useState("00:00");
  const [capturedMatchTimeMeta, setCapturedMatchTimeMeta] = useState<MatchTimeMeta | null>(null);
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
  const a2Observations = observations.filter(isA2Observation);
  const interestingObservations = a2Observations.filter((item) => item.isInteresting);
  const teamOptions = teamsByCompetition[competition] ?? [];
  const sessionName = getSessionName(competition, teamA, teamB, trackMeta.code);
  const focusTeam = focusPerspective === "Team A" ? teamA : focusPerspective === "Team B" ? teamB : "Beide Teams";
  const matchClock = getCurrentMatchTime(activeSession, nowMs);
  const matchClockSeconds = getCurrentMatchSeconds(activeSession, nowMs);
  const matchClockPeriod: MatchClockPeriod = activeSession?.matchClockPeriod ?? "first";
  const matchClockDisplay = getMatchClockDisplay(matchClockSeconds, matchClockPeriod);
  const matchClockLabel = formatMatchClockLabel(matchClockSeconds, matchClockPeriod);
  const timeCorrectionSeconds = activeSession?.matchTimeCorrectionSeconds ?? 0;
  const isMatchClockPaused = Boolean(activeSession?.isMatchClockPaused);
  const teamASuggestion = getTeamSuggestion(teamA, teamOptions);
  const teamBSuggestion = getTeamSuggestion(teamB, teamOptions);
  const teamAMatches = getTeamMatches(teamA, teamOptions);
  const teamBMatches = getTeamMatches(teamB, teamOptions);
  const isTeamAValid = teamOptions.includes(teamA);
  const isTeamBValid = teamOptions.includes(teamB);
  const canCreateSession = Boolean(token && account && competition && teamA && teamB && isTeamAValid && isTeamBValid && focusPerspective && parseMatchTime(sessionStartMatchTime) !== null);

  const stats = useMemo(() => {
    const levelCounts = a2Observations.reduce<Record<string, number>>((counts, item) => {
      if (item.pressureLevel) counts[item.pressureLevel] = (counts[item.pressureLevel] ?? 0) + 1;
      return counts;
    }, {});
    const mostCommonLevel = Object.entries(levelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
    const goodSolutions = a2Observations.filter((item) => item.solutionQuality === "gut gelöst").length;
    return {
      count: a2Observations.length,
      mostCommonLevel,
      goodRate: a2Observations.length ? Math.round((goodSolutions / a2Observations.length) * 100) : 0,
    };
  }, [a2Observations]);

  function openSetup() {
    setError("");
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

  async function createSession() {
    if (!canCreateSession || !token) return;
    setIsSaving(true);
    setError("");
    const sessionStartTimestamp = new Date().toISOString();

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          competition,
          teamA,
          teamB,
          focusTeam,
          focusPerspective,
          phase,
          track: trackMeta.code,
          trackTitle: trackMeta.title,
          sessionName,
          sessionStartMatchTime,
          sessionStartTimestamp,
          matchTimeCorrectionSeconds: 0,
          isMatchClockPaused: false,
          matchClockPausedSeconds: null,
          matchClockPeriod: "first",
        }),
      });
      if (response.status === 409) {
        await loadActiveSessionFromServer(token);
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
      setIsLearningHelpOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Session konnte nicht erstellt werden.");
    } finally {
      setIsSaving(false);
    }
  }

  function createDummySession() {
    const now = new Date().toISOString();
    const dummySession: StoredSession = {
      id: "dummy-a2-" + Date.now(),
      profileId: account?.profileId ?? "dummy-profile",
      profileName: account?.profileName ?? "Testprofil",
      competition: "WM 2026",
      teamA: "USA",
      teamB: "Australien",
      focusTeam: "Beide Teams",
      focusPerspective: "Beide Teams",
      phase: "Testsession",
      track: "A2",
      trackTitle: "Druck erkennen",
      sessionName: "WM 2026 | USA – Australien | A2 Test",
      sessionStartMatchTime: "82:38",
      sessionStartTimestamp: now,
      matchTimeCorrectionSeconds: 0,
      isMatchClockPaused: false,
      matchClockPausedSeconds: null,
      matchClockPeriod: "first",
      status: "active",
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      observations: [
        { id: "dummy-a2-observation-1", time: "83:12", matchTime: "83:12", matchTimeMeta: getMatchTimeMeta(83 * 60 + 12, "second"), track: "A2", pressureLevel: "hoch", pressureDirection: "seitlich", timeWindow: "sofortiger Handlungszwang", solutionQuality: "gut gelöst", outcome: "Druck gelöst", isInteresting: false },
        { id: "dummy-a2-observation-2", time: "61:33", matchTime: "61:33", matchTimeMeta: getMatchTimeMeta(61 * 60 + 33, "second"), track: "A2", pressureLevel: "mittel", pressureDirection: "von hinten", timeWindow: "kurz", solutionQuality: "erzwungen / verloren", outcome: "Ballverlust", isInteresting: true },
      ],
    };

    setActiveSession(dummySession);
    setIsSetupOpen(false);
    setIsFormOpen(false);
    setIsLearningHelpOpen(false);
    setError("");
    setNowMs(Date.now());
  }

  function resetObservationDraft() {
    setPressureLevel("mittel");
    setPressureDirection("seitlich");
    setTimeWindow("kurz");
    setSolutionQuality("okay");
    setOutcome("Druck gelöst");
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
    setCapturedMatchTime(matchClockLabel);
    setCapturedMatchTimeMeta(getMatchTimeMeta(matchClockSeconds, matchClockPeriod));
    setIsFormOpen(true);
  }

  function startEditingObservation(observation: Observation) {
    setEditingObservationId(observation.id);
    setCapturedMatchTime(observation.matchTime || observation.time);
    setCapturedMatchTimeMeta(observation.matchTimeMeta ?? null);
    setPressureLevel(observation.pressureLevel ?? "mittel");
    setPressureDirection(observation.pressureDirection ?? "seitlich");
    setTimeWindow(observation.timeWindow ?? "kurz");
    setSolutionQuality(observation.solutionQuality ?? "okay");
    setOutcome(outcomes.includes(observation.outcome as PressureOutcome) ? observation.outcome as PressureOutcome : "Druck gelöst");
    setIsInteresting(Boolean(observation.isInteresting));
    setIsFormOpen(true);
  }

  async function updateTimeline(
    payload: { matchTimeCorrectionSeconds?: number; isMatchClockPaused?: boolean; matchClockPausedSeconds?: number | null; matchClockPeriod?: MatchClockPeriod },
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

  function getActiveTimerFloor(totalSeconds: number) {
    if (totalSeconds >= 90 * 60) return 90 * 60;
    if (totalSeconds >= 45 * 60) return 45 * 60;
    return 0;
  }

  function updateTimeCorrection(deltaSeconds: number) {
    if (!activeSession) return;
    const timerFloorSeconds = getActiveTimerFloor(matchClockSeconds);
    const targetSeconds = Math.max(timerFloorSeconds, matchClockSeconds + deltaSeconds);
    if (isMatchClockPaused) {
      updateTimeline({ matchClockPausedSeconds: targetSeconds }, "Pausierte Spielzeit auf " + formatMatchClockLabel(targetSeconds, matchClockPeriod) + " gesetzt.");
      return;
    }
    const nextCorrectionSeconds = getCorrectionForTarget(targetSeconds, Date.now());
    updateTimeline({ matchTimeCorrectionSeconds: nextCorrectionSeconds }, "Spielzeit auf " + formatMatchClockLabel(targetSeconds, matchClockPeriod) + " gesetzt.");
  }

  function toggleMatchClockPause() {
    if (!activeSession) return;
    const timestampMs = Date.now();
    if (isMatchClockPaused) {
      const resumeSeconds = activeSession.matchClockPausedSeconds ?? matchClockSeconds;
      const nextCorrectionSeconds = getCorrectionForTarget(resumeSeconds, timestampMs);
      updateTimeline({ matchTimeCorrectionSeconds: nextCorrectionSeconds, isMatchClockPaused: false, matchClockPausedSeconds: null, matchClockPeriod }, `Spielzeit läuft weiter ab ${formatMatchTime(resumeSeconds)}.`);
      return;
    }
    updateTimeline({ isMatchClockPaused: true, matchClockPausedSeconds: matchClockSeconds }, `Spielzeit bei ${formatMatchTime(matchClockSeconds)} pausiert.`);
  }

  function jumpToSecondHalf() {
    if (!activeSession) return;
    const secondHalfStartSeconds = 45 * 60;
    if (isMatchClockPaused) {
      updateTimeline(
        { matchClockPausedSeconds: secondHalfStartSeconds, matchClockPeriod: "second" },
        "Pausierte Spielzeit auf " + formatMatchClockLabel(secondHalfStartSeconds, "second") + " gesetzt."
      );
      return;
    }
    const nextCorrectionSeconds = getCorrectionForTarget(secondHalfStartSeconds, Date.now());
    updateTimeline(
      { matchTimeCorrectionSeconds: nextCorrectionSeconds, matchClockPeriod: "second" },
      "Spielzeit auf " + formatMatchClockLabel(secondHalfStartSeconds, "second") + " gesetzt."
    );
  }

  function jumpToFirstHalf() {
    if (!activeSession) return;
    const firstHalfStartSeconds = Math.min(matchClockSeconds, (45 * 60) - 1);
    if (isMatchClockPaused) {
      updateTimeline({ matchClockPausedSeconds: firstHalfStartSeconds, matchClockPeriod: "first" }, "Pausierte Spielzeit auf " + formatMatchClockLabel(firstHalfStartSeconds, "first") + " gesetzt.");
      return;
    }
    const nextCorrectionSeconds = getCorrectionForTarget(firstHalfStartSeconds, Date.now());
    updateTimeline({ matchTimeCorrectionSeconds: nextCorrectionSeconds, matchClockPeriod: "first" }, "Spielzeit auf " + formatMatchClockLabel(firstHalfStartSeconds, "first") + " gesetzt.");
  }

  function jumpToMatchTime() {
    if (!activeSession) return;
    const targetSeconds = parseMatchTime(jumpMatchTime);
    const targetPeriod: MatchClockPeriod = targetSeconds !== null && targetSeconds >= 45 * 60 ? "second" : "first";
    if (targetSeconds === null) {
      setError("Bitte gib die Spielzeit im Format mm:ss ein.");
      return;
    }
    if (isMatchClockPaused) {
      updateTimeline({ matchClockPausedSeconds: targetSeconds, matchClockPeriod: targetPeriod }, "Pausierte Spielzeit auf " + formatMatchClockLabel(targetSeconds, targetPeriod) + " gesetzt.");
      return;
    }
    const nextCorrectionSeconds = getCorrectionForTarget(targetSeconds, Date.now());
    updateTimeline({ matchTimeCorrectionSeconds: nextCorrectionSeconds, matchClockPeriod: targetPeriod }, "Spielzeit auf " + formatMatchClockLabel(targetSeconds, targetPeriod) + " gesetzt.");
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
        body: JSON.stringify({
          time: getWallTime(),
          track: "A2",
          matchTime: capturedMatchTime,
          matchTimeMeta: capturedMatchTimeMeta,
          pressureLevel,
          pressureDirection,
          timeWindow,
          solutionQuality,
          outcome,
          isInteresting,
        }),
      });
      if (!response.ok) throw new Error(isEditing ? "Drucksituation konnte nicht aktualisiert werden." : "Drucksituation konnte nicht gespeichert werden.");
      const session = (await response.json()) as StoredSession;
      setActiveSession(session);
      cacheSession(session);
      resetObservationDraft();
      setIsFormOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Drucksituation konnte nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteObservation(observation: Observation) {
    if (!activeSession || !token) return;
    if (!window.confirm(`Drucksituation bei ${observation.matchTime || observation.time} wirklich löschen?`)) return;
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/observations/${observation.id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!response.ok) throw new Error("Drucksituation konnte nicht gelöscht werden.");
      const session = (await response.json()) as StoredSession;
      setActiveSession(session);
      cacheSession(session);
      if (editingObservationId === observation.id) {
        resetObservationDraft();
        setIsFormOpen(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Drucksituation konnte nicht gelöscht werden.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className={activeSession ? "track-shell live-track-shell" : "track-shell"}>
      <header className="track-topbar">
        <a className="brand" href="/" aria-label="Zur Pitch-Tank-Startseite"><span className="brand-mark" aria-hidden="true">PT</span><span>Pitch Tank</span></a>
        <nav className="nav-links" aria-label="Track-Navigation"><a href="/account">Account</a><a href="/sessions">Verlauf</a><a href="/tracks/a/a1">A1</a><a href="/#lernpfade">Lernpfade</a></nav>
        <button className="topbar-test-session-button" type="button" onClick={createDummySession}>Testsession</button>
      </header>

      {!activeSession ? <section className="track-hero" aria-labelledby="track-title"><p className="eyebrow">Track A · Session 2</p><h1 id="track-title">A2 – Druck erkennen</h1><p>Lerne einzuschätzen, wie viel Zeit und Handlungsfreiheit der Ballführer wirklich hat.</p></section> : null}

      <div className={activeSession ? "track-layout live-mode-layout" : "track-layout"}>
        <div className="track-main">
          {!account && !activeSession ? <section className="account-required-card" aria-labelledby="account-required-title"><p className="eyebrow">Profil fehlt</p><h2 id="account-required-title">Erstelle zuerst dein Profil</h2><p>Sessions und Beobachtungen werden im Backend gespeichert und deinem Account zugeordnet.</p><a className="button button-primary" href="/account">Profil erstellen oder einloggen</a></section> : null}
          {error ? <section className="account-required-card"><p className="account-error">{error}</p></section> : null}

          {activeSession ? (
            <ActiveSessionHeader session={activeSession} statusLabel={isMatchClockPaused ? "Pausiert" : matchClockDisplay.label} baseTime={matchClockDisplay.baseTime} stoppageTime={matchClockDisplay.stoppageTime} isPaused={isMatchClockPaused} isSaving={isSaving} isCorrectingTime={isCorrectingTime} onTogglePause={toggleMatchClockPause} onFinish={() => finishSession("completed")} timeControl={<TimeControl value={jumpMatchTime} correctionLabel={formatCorrectionOffset(timeCorrectionSeconds)} isPaused={isMatchClockPaused} period={matchClockPeriod} disabled={!activeSession || isCorrectingTime} message={timeCorrectionMessage} interestingScenes={<div className="interesting-list">{interestingObservations.length ? interestingObservations.map((item) => <span key={item.id}>★ {item.matchTime || item.time}</span>) : <span>Noch keine markierten Szenen</span>}</div>} onChange={(value) => setJumpMatchTime(maskMatchTimeInput(value))} onFocus={() => setJumpMatchTime(matchClock)} onStep={updateTimeCorrection} onApply={jumpToMatchTime} onFirstHalf={jumpToFirstHalf} onSecondHalf={jumpToSecondHalf} onTogglePause={toggleMatchClockPause} />} />
          ) : null}

          {!activeSession ? <A2LearningContent variant="drill" /> : null}

          {!activeSession ? <section className="session-panel" aria-labelledby="session-title"><div><p className="eyebrow">Session</p><h2 id="session-title">Spiel vor der Beobachtung festlegen</h2><p>Erfasse Wettbewerb, Teams, Fokus und die aktuelle Spielzeit direkt für Track A2.</p></div><div className="session-panel-actions"><button className="button button-primary" type="button" onClick={openSetup} disabled={!account}>Session starten</button><button className="button button-secondary test-session-button" type="button" onClick={createDummySession}>Testsession starten</button></div></section> : null}

          {isSetupOpen ? (
            <section className="setup-card" aria-labelledby="setup-title"><div className="section-heading compact-heading"><p className="eyebrow">Session-Setup</p><h2 id="setup-title">Welches Spiel beobachtest du?</h2></div>
              <form className="setup-form" onSubmit={(event) => event.preventDefault()}>
                <label className="field"><span>Wettbewerb</span><select value={competition} onChange={(event) => updateCompetition(event.target.value)} required>{competitions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <div className="field-grid"><TeamAutocomplete fieldId="team-a" label="Team A" value={teamA} onChange={setTeamA} matches={teamAMatches} suggestion={teamASuggestion} isValid={isTeamAValid} isOpen={focusedTeamField === "teamA"} onFocus={() => setFocusedTeamField("teamA")} onBlur={() => window.setTimeout(() => setFocusedTeamField((current) => current === "teamA" ? null : current), 120)} /><TeamAutocomplete fieldId="team-b" label="Team B" value={teamB} onChange={setTeamB} matches={teamBMatches} suggestion={teamBSuggestion} isValid={isTeamBValid} isOpen={focusedTeamField === "teamB"} onFocus={() => setFocusedTeamField("teamB")} onBlur={() => window.setTimeout(() => setFocusedTeamField((current) => current === "teamB" ? null : current), 120)} /></div>
                {!teamOptions.length ? <p className="form-hint">Für diesen Wettbewerb sind noch keine Teams hinterlegt. Eine Session kann erst mit hinterlegten Teams gestartet werden.</p> : <p className="form-hint">Tippe los und wähle ein Team aus den Vorschlägen. Freitext ist hier nicht gültig.</p>}
                <fieldset className="choice-group setup-choice"><legend>Welches Team beobachtest du hauptsächlich?</legend><div>{(["Beide Teams", "Team A", "Team B"] as FocusPerspective[]).map((option) => <button className={option === focusPerspective ? "choice active" : "choice"} key={option} type="button" onClick={() => setFocusPerspective(option)}>{option === "Team A" && teamA ? teamA : option === "Team B" && teamB ? teamB : option}</button>)}</div></fieldset>
                <label className="field"><span>Phase / Spieltag</span><input list="phase-examples" value={phase} onChange={(event) => setPhase(event.target.value)} placeholder="Gruppenphase Spieltag 1" /><datalist id="phase-examples">{phaseExamples.map((example) => <option key={example} value={example} />)}</datalist></label>
                <label className="field"><span>Fokus-Track</span><input value={trackMeta.code + " – " + trackMeta.title} readOnly /></label>
                <label className="field"><span>Aktuelle Spielzeit</span><input value={sessionStartMatchTime} onChange={(event) => setSessionStartMatchTime(maskMatchTimeInput(event.target.value))} inputMode="numeric" placeholder="00:00" required /><small>Tippe nur Zahlen, zum Beispiel 5256 für 52:56. Pitch Tank verwendet diese Zeit als Startpunkt für die Session-Timeline.</small></label>
                <div className="generated-session-name"><span>Sessionname</span><strong>{sessionName}</strong></div>
                <button className="button button-primary" type="button" onClick={createSession} disabled={!canCreateSession || isSaving}>{isSaving ? "Speichere..." : "Setup abschließen und Session starten"}</button>
              </form>
            </section>
          ) : null}

          {activeSession ? (
            <DrillCompass title="A2 – Druck erkennen" observe="Wie stark ist der Ballführer durch Gegnerdruck eingeschränkt?" trigger="Ein Spieler den Ball kontrolliert erhält und Druck entsteht oder bereits vorhanden ist." onOpenHelp={() => setIsLearningHelpOpen(true)} />
          ) : null}

          <section className={activeSession ? "live-capture-panel primary-capture-panel" : "observation-area"} aria-labelledby="observe-title"><div className="observe-header"><div><p className="eyebrow">{activeSession ? "Primäre Aktion" : "Beobachtung erfassen"}</p><h2 id="observe-title">Drucksituation einordnen</h2></div><button className="capture-button" type="button" onClick={toggleObservationForm} disabled={!activeSession}>+ Drucksituation erfassen</button></div>
            {!activeSession ? <p className="empty-state">Starte zuerst eine Session, um Beobachtungen zu speichern.</p> : null}
            {isFormOpen && activeSession ? <form className="observation-form" onSubmit={(event) => event.preventDefault()}><div className="captured-time-banner"><span>{editingObservationId ? "Bearbeitete Szenenzeit" : "Szenenzeit"}</span><strong>{capturedMatchTime}</strong><small>{editingObservationId ? "Zeitstempel des gespeicherten Eintrags." : "Fixiert beim Klick auf „Drucksituation erfassen“."}</small></div><ChoiceGroup label="Wie hoch war der Druck?" help="Bewerte, wie stark der Ballführer in seiner Entscheidung eingeschränkt war." options={pressureLevels} value={pressureLevel} onChange={setPressureLevel} explanations={pressureHelp} /><ChoiceGroup label="Aus welcher Richtung kam der Druck?" options={pressureDirections} value={pressureDirection} onChange={setPressureDirection} explanations={directionHelp} /><ChoiceGroup label="Wie groß war das Zeitfenster?" options={timeWindows} value={timeWindow} onChange={setTimeWindow} explanations={timeWindowHelp} /><ChoiceGroup label="Wie wurde die Situation gelöst?" options={solutionQualities} value={solutionQuality} onChange={setSolutionQuality} explanations={solutionHelp} /><ChoiceGroup label="Wie endete die Aktion?" options={outcomes} value={outcome} onChange={setOutcome} /><label className="checkbox-field"><input type="checkbox" checked={isInteresting} onChange={(event) => setIsInteresting(event.target.checked)} /> <span>Besonders interessante Szene</span></label><div className="observation-form-actions"><button className="button button-primary" type="button" onClick={saveObservation} disabled={isSaving}>{isSaving ? "Speichere..." : editingObservationId ? "Änderung speichern" : "Drucksituation speichern"}</button>{editingObservationId ? <button className="button button-secondary" type="button" onClick={() => { resetObservationDraft(); setIsFormOpen(false); }} disabled={isSaving}>Bearbeitung abbrechen</button> : null}</div></form> : null}
          </section>

          {activeSession ? (
            <>
              <section className="live-timeline" aria-labelledby="live-timeline-title"><div className="section-heading compact-heading"><p className="eyebrow">Timeline</p><h2 id="live-timeline-title">Drucksituationen</h2></div>{a2Observations.length ? <div className="live-timeline-list">{a2Observations.map((item) => <ObservationTimelineItem key={item.id} variant="a2" matchTime={item.matchTime || item.time} secondary={item.pressureLevel ?? "-"} status={(item.solutionQuality ?? "-") + " · " + item.outcome} details={(item.pressureDirection ?? "-") + " · " + (item.timeWindow ?? "-")} isInteresting={item.isInteresting} isSaving={isSaving} onEdit={() => startEditingObservation(item)} onDelete={() => deleteObservation(item)} />)}</div> : <p className="empty-state">Noch keine A2-Beobachtungen gespeichert.</p>}</section>

              <details className="session-stat-panel"><summary><span>Session Statistik</span><strong>{stats.count} Drucksituationen</strong></summary><section className="stats-grid compact-stats" aria-label="Live-Statistik A2"><article className="stat-card"><span>Drucksituationen</span><strong>{stats.count}</strong></article><article className="stat-card"><span>Häufigstes Druckniveau</span><strong>{stats.mostCommonLevel}</strong></article><article className="stat-card"><span>Gut gelöst</span><strong>{stats.goodRate}%</strong></article></section></details>

              <CollapsibleHelp id="a2-learning-help" open={isLearningHelpOpen} onToggle={setIsLearningHelpOpen}><A2LearningContent variant="live" /></CollapsibleHelp>
            </>
          ) : (
            <>
              <section className="stats-grid" aria-label="Live-Statistik A2"><article className="stat-card"><span>Drucksituationen</span><strong>{stats.count}</strong></article><article className="stat-card"><span>Häufigstes Druckniveau</span><strong>{stats.mostCommonLevel}</strong></article><article className="stat-card"><span>Gut gelöst</span><strong>{stats.goodRate}%</strong></article></section>
              <section className="session-log" aria-labelledby="log-title"><div className="section-heading compact-heading"><p className="eyebrow">Session-Log</p><h2 id="log-title">Gespeicherte A2-Beobachtungen</h2></div>{a2Observations.length ? <div className="log-list">{a2Observations.map((item) => <article className={item.isInteresting ? "log-item interesting" : "log-item"} key={item.id}><time>{item.isInteresting ? "★ " : ""}{item.matchTime || item.time}</time><p>Druck: {item.pressureLevel ?? "-"}</p><p>Richtung: {item.pressureDirection ?? "-"}</p><p>Zeitfenster: {item.timeWindow ?? "-"}</p><p>Lösung: {item.solutionQuality ?? "-"}</p><p>Ergebnis: {item.outcome}</p><div className="log-actions"><button type="button" onClick={() => startEditingObservation(item)} disabled={isSaving}>Bearbeiten</button><button type="button" onClick={() => deleteObservation(item)} disabled={isSaving}>Löschen</button></div></article>)}</div> : <p className="empty-state">Noch keine A2-Beobachtungen gespeichert.</p>}</section>
            </>
          )}
        </div>

        {!activeSession ? <aside className="observation-flow" aria-labelledby="flow-title"><details className="flow-help-details" open><summary><span className="eyebrow">Permanente Hilfe</span><h2 id="flow-title">Beobachtungsablauf</h2></summary><ol><li>Spieler erhält den Ball.</li><li>Gegnerdruck einschätzen.</li><li>Druckrichtung erkennen.</li><li>Zeitfenster bewerten.</li><li>Entscheidung und Ergebnis einordnen.</li></ol></details></aside> : null}
      </div>
    </main>
  );
}


function A2LearningContent({ variant }: { variant: "drill" | "live" }) {
  return (
    <div className={variant === "live" ? "a1-learning-stack live-learning-stack" : "a1-learning-stack"}>
      <section className="lesson-box" aria-labelledby={variant === "live" ? "live-a2-goal-title" : "goal-title"}>
        <h2 id={variant === "live" ? "live-a2-goal-title" : "goal-title"}>Lernziel</h2>
        <p>A2 baut auf A1 auf.</p>
        <p>In A1 hast du gelernt, Anspieloptionen zu erkennen. In A2 beobachtest du, ob der Ballführer diese Optionen unter Gegnerdruck überhaupt nutzen kann.</p>
        <p>Nicht jede schlechte Aktion ist ein Fehler. Manchmal ist sie die Folge von Druck, Zeitmangel oder fehlender Handlungsfreiheit.</p>
      </section>

      <section className="guide-card" aria-labelledby={variant === "live" ? "live-a2-flow-title" : "a2-flow-title"}>
        <p className="eyebrow">Beobachtungsablauf</p>
        <h2 id={variant === "live" ? "live-a2-flow-title" : "a2-flow-title"}>Wie funktioniert A2?</h2>
        <ol className="flow-list"><li>Spieler erhält den Ball.</li><li>Gegnerdruck einschätzen.</li><li>Druckrichtung erkennen.</li><li>Zeitfenster bewerten.</li><li>Entscheidung und Ergebnis einordnen.</li></ol>
      </section>

      <section className="guide-card" aria-labelledby={variant === "live" ? "live-a2-when-title" : "when-observe-title"}>
        <p className="eyebrow">Auslöser</p>
        <h2 id={variant === "live" ? "live-a2-when-title" : "when-observe-title"}>Wann erfasse ich eine Beobachtung?</h2>
        <p>Erfasse eine Beobachtung, wenn ein Spieler den Ball kontrolliert erhält und Gegnerdruck entsteht oder bereits vorhanden ist.</p>
        <div className="guide-columns"><div><h3>Geeignete Situationen</h3><ul><li>Innenverteidiger wird im Aufbau angelaufen</li><li>Sechser erhält den Ball mit Gegner im Rücken</li><li>Außenverteidiger wird an der Linie unter Druck gesetzt</li><li>Flügelspieler bekommt den Ball und wird sofort gedoppelt</li></ul></div><div><h3>Weniger geeignete Situationen</h3><ul><li>Zufallsbälle</li><li>Kopfballduelle</li><li>Pressschläge</li><li>Situationen ohne kontrollierten Ballbesitz</li></ul></div></div>
      </section>

      <section className="guide-card" aria-labelledby={variant === "live" ? "live-a2-examples-title" : "a2-examples-title"}>
        <p className="eyebrow">Beispiele</p>
        <h2 id={variant === "live" ? "live-a2-examples-title" : "a2-examples-title"}>Druck einordnen</h2>
        <div className="category-help-grid examples-grid" aria-label="A2 Kategorien erklärt">
          {pressureLevels.map((level) => <article className="category-help" key={level}><h3>{level}</h3><p>{pressureHelp[level]}</p></article>)}
          {timeWindows.map((window) => <article className="category-help" key={window}><h3>{window}</h3><p>{timeWindowHelp[window]}</p></article>)}
        </div>
      </section>
    </div>
  );
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

function ChoiceGroup<T extends string>({ label, help, options, value, onChange, explanations }: { label: string; help?: string; options: T[]; value: T; onChange: (value: T) => void; explanations?: Record<T, string> }) {
  return <fieldset className="choice-group"><legend>{label}</legend>{help ? <p className="choice-help">{help}</p> : null}<div>{options.map((option) => <button className={option === value ? "choice active" : "choice"} key={option} type="button" onClick={() => onChange(option)}>{option}</button>)}</div>{explanations ? <div className="category-help-grid" aria-label={`${label} erklärt`}>{options.map((option) => <article className={option === value ? "category-help active" : "category-help"} key={option}><h3>{option}</h3><p>{explanations[option]}</p></article>)}</div> : null}</fieldset>;
}
