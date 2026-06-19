"use client";

import { useEffect, useMemo, useState } from "react";
import { ActiveSessionHeader } from "@/components/pitch/ActiveSessionHeader";
import { CollapsibleHelp } from "@/components/pitch/CollapsibleHelp";
import { DrillCompass } from "@/components/pitch/DrillCompass";
import { ObservationTimelineItem } from "@/components/pitch/ObservationTimelineItem";
import { TimeControl } from "@/components/pitch/TimeControl";
import worldCup2026 from "@/data/world-cup-2026.json";

type OptionCount = "1" | "2" | "3" | "4" | "5+";
type BestOption = "Sicherheit" | "Raumgewinn" | "Progression" | "Seitenwechsel" | "Durchbruch";
type Played = "Ja" | "Nein" | "Unsicher";
type Outcome = "Ballbesitz gehalten" | "Raumgewinn" | "Druck aufgelöst" | "Ballverlust" | "Torchance";
type FocusPerspective = "Beide Teams" | "Team A" | "Team B";
type MatchClockPeriod = "first" | "second";

type AccountUser = { id: string; profileId: string; profileName: string; email: string; createdAt: string };

type MatchTimeMeta = { totalSeconds: number; baseTime: string; stoppageTime: string | null; periodLabel: string };

type Observation = {
  id: string;
  time: string;
  matchTime: string;
  matchTimeMeta?: MatchTimeMeta;
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

function getA1Stats(observations: Observation[]) {
  const playedDecisions = observations.filter((item) => item.played !== "Unsicher");
  const playedYes = playedDecisions.filter((item) => item.played === "Ja").length;
  const averageOptions = observations.length ? observations.reduce((sum, item) => sum + optionValues[item.optionCount], 0) / observations.length : 0;

  return {
    count: observations.length,
    averageOptions: observations.length ? averageOptions.toFixed(1) : "0",
    playedRate: playedDecisions.length ? Math.round((playedYes / playedDecisions.length) * 100) : 0,
  };
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
  const [reportSession, setReportSession] = useState<StoredSession | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isSessionGuardOpen, setIsSessionGuardOpen] = useState(false);
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
  const [selectedTrack, setSelectedTrack] = useState("A1");
  const [sessionStartMatchTime, setSessionStartMatchTime] = useState("00:00");

  const [optionCount, setOptionCount] = useState<OptionCount>("3");
  const [bestOption, setBestOption] = useState<BestOption>("Raumgewinn");
  const [played, setPlayed] = useState<Played>("Ja");
  const [outcome, setOutcome] = useState<Outcome>("Ballbesitz gehalten");
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
  const reportObservations = reportSession?.observations ?? [];
  const reportStats = useMemo(() => getA1Stats(reportObservations), [reportObservations]);
  const mode = activeSession ? "live" : reportSession ? "report" : "drill";
  const teamOptions = teamsByCompetition[competition] ?? [];
  const trackMeta = focusTracks.find((track) => track.code === selectedTrack) ?? focusTracks[0];
  const sessionName = getSessionName(competition, teamA, teamB, selectedTrack);
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
  const canCreateSession = Boolean(token && account && competition && teamA && teamB && isTeamAValid && isTeamBValid && focusPerspective && selectedTrack && parseMatchTime(sessionStartMatchTime) !== null);

  const stats = useMemo(() => getA1Stats(observations), [observations]);

  function openSetup() {
    setError("");
    if (activeSession && (activeSession.status ?? "active") === "active") {
      setIsSessionGuardOpen(true);
      setIsSetupOpen(false);
      setIsFormOpen(false);
      setIsLearningHelpOpen(false);
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
      setReportSession(nextStatus === "completed" ? updatedSession : null);
      setIsFormOpen(false);
      setIsSetupOpen(false);
      setIsSessionGuardOpen(false);
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
    setCapturedMatchTime(matchClockLabel);
    setCapturedMatchTimeMeta(getMatchTimeMeta(matchClockSeconds, matchClockPeriod));
    setIsFormOpen(true);
  }

  function startEditingObservation(observation: Observation) {
    setEditingObservationId(observation.id);
    setCapturedMatchTime(observation.matchTime || observation.time);
    setCapturedMatchTimeMeta(observation.matchTimeMeta ?? null);
    setOptionCount(observation.optionCount);
    setBestOption(observation.bestOption);
    setPlayed(observation.played);
    setOutcome(observation.outcome);
    setIsInteresting(observation.isInteresting);
    setIsFormOpen(true);
  }

  async function createSession() {
    if (!canCreateSession || !token) return;
    await createSessionFromPayload({
      competition,
      teamA,
      teamB,
      focusTeam,
      focusPerspective,
      phase,
      track: selectedTrack,
      trackTitle: trackMeta.title,
      sessionName,
      sessionStartMatchTime,
    });
  }

  function createDummySession() {
    const now = new Date().toISOString();
    const dummySession: StoredSession = {
      id: "dummy-a1-" + Date.now(),
      profileId: account?.profileId ?? "dummy-profile",
      profileName: account?.profileName ?? "Testprofil",
      competition: "WM 2026",
      teamA: "USA",
      teamB: "Australien",
      focusTeam: "Beide Teams",
      focusPerspective: "Beide Teams",
      phase: "Testsession",
      track: "A1",
      trackTitle: "Anspielbarkeit beobachten",
      sessionName: "WM 2026 | USA – Australien | A1 Test",
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
        { id: "dummy-observation-1", time: "83:12", matchTime: "83:12", matchTimeMeta: getMatchTimeMeta(83 * 60 + 12, "second"), optionCount: "4", bestOption: "Sicherheit", played: "Ja", outcome: "Ballbesitz gehalten", isInteresting: false },
        { id: "dummy-observation-2", time: "61:33", matchTime: "61:33", matchTimeMeta: getMatchTimeMeta(61 * 60 + 33, "second"), optionCount: "2", bestOption: "Progression", played: "Nein", outcome: "Ballverlust", isInteresting: true },
      ],
    };

    setActiveSession(dummySession);
    setReportSession(null);
    setIsSetupOpen(false);
    setIsFormOpen(false);
    setIsSessionGuardOpen(false);
    setIsLearningHelpOpen(false);
    setError("");
    setNowMs(Date.now());
  }

  async function createSessionFromPayload(payload: { competition: string; teamA: string; teamB: string; focusTeam: string; focusPerspective: FocusPerspective; phase: string; track: string; trackTitle: string; sessionName: string; sessionStartMatchTime: string }) {
    if (!token || !account) return;
    setIsSaving(true);
    setError("");
    const sessionStartTimestamp = new Date().toISOString();

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ ...payload, sessionStartTimestamp, matchTimeCorrectionSeconds: 0, isMatchClockPaused: false, matchClockPausedSeconds: null, matchClockPeriod: "first" }),
      });
      if (response.status === 409) {
        const serverActiveSession = await loadActiveSessionFromServer(token);
        if (serverActiveSession) setIsSessionGuardOpen(true);
        throw new Error("Es läuft bereits eine aktive Session.");
      }
      if (!response.ok) throw new Error("Session konnte nicht erstellt werden.");
      const session = (await response.json()) as StoredSession;
      setActiveSession(session);
      setReportSession(null);
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
      updateTimeline(
        { matchClockPausedSeconds: targetSeconds },
        "Pausierte Spielzeit auf " + formatMatchClockLabel(targetSeconds, matchClockPeriod) + " gesetzt."
      );
      return;
    }
    const nextCorrectionSeconds = getCorrectionForTarget(targetSeconds, Date.now());
    updateTimeline(
      { matchTimeCorrectionSeconds: nextCorrectionSeconds },
      "Spielzeit auf " + formatMatchClockLabel(targetSeconds, matchClockPeriod) + " gesetzt."
    );
  }

  function toggleMatchClockPause() {
    if (!activeSession) return;
    const timestampMs = Date.now();
    if (isMatchClockPaused) {
      const resumeSeconds = activeSession.matchClockPausedSeconds ?? matchClockSeconds;
      const nextCorrectionSeconds = getCorrectionForTarget(resumeSeconds, timestampMs);
      updateTimeline(
        { matchTimeCorrectionSeconds: nextCorrectionSeconds, isMatchClockPaused: false, matchClockPausedSeconds: null, matchClockPeriod },
        `Spielzeit läuft weiter ab ${formatMatchTime(resumeSeconds)}.`
      );
      return;
    }
    updateTimeline(
      { isMatchClockPaused: true, matchClockPausedSeconds: matchClockSeconds },
      `Spielzeit bei ${formatMatchTime(matchClockSeconds)} pausiert.`
    );
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
      updateTimeline(
        { matchClockPausedSeconds: firstHalfStartSeconds, matchClockPeriod: "first" },
        "Pausierte Spielzeit auf " + formatMatchClockLabel(firstHalfStartSeconds, "first") + " gesetzt."
      );
      return;
    }
    const nextCorrectionSeconds = getCorrectionForTarget(firstHalfStartSeconds, Date.now());
    updateTimeline(
      { matchTimeCorrectionSeconds: nextCorrectionSeconds, matchClockPeriod: "first" },
      "Spielzeit auf " + formatMatchClockLabel(firstHalfStartSeconds, "first") + " gesetzt."
    );
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
      updateTimeline(
        { matchClockPausedSeconds: targetSeconds, matchClockPeriod: targetPeriod },
        "Pausierte Spielzeit auf " + formatMatchClockLabel(targetSeconds, targetPeriod) + " gesetzt."
      );
      return;
    }
    const nextCorrectionSeconds = getCorrectionForTarget(targetSeconds, Date.now());
    updateTimeline(
      { matchTimeCorrectionSeconds: nextCorrectionSeconds, matchClockPeriod: targetPeriod },
      "Spielzeit auf " + formatMatchClockLabel(targetSeconds, targetPeriod) + " gesetzt."
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
        body: JSON.stringify({ time: getWallTime(), matchTime: capturedMatchTime, matchTimeMeta: capturedMatchTimeMeta, optionCount, bestOption, played, outcome, isInteresting }),
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
    <main className={mode === "live" ? "track-shell live-track-shell" : "track-shell"}>
      <header className="track-topbar">
        <a className="brand" href="/" aria-label="Zur Pitch-Tank-Startseite"><span className="brand-mark" aria-hidden="true">PT</span><span>Pitch Tank</span></a>
        <nav className="nav-links" aria-label="Track-Navigation"><a href="/account">Account</a><a href="/sessions">Verlauf</a><a href="/#lernpfade">Lernpfade</a></nav>
        <button className="topbar-test-session-button" type="button" onClick={createDummySession}>Testsession</button>
      </header>

      {mode === "drill" ? <section className="track-hero" aria-labelledby="track-title"><p className="eyebrow">Track A · Session 1</p><h1 id="track-title">A1 – Anspielbarkeit beobachten</h1><p>Lerne, Optionen des Ballführers bewusster wahrzunehmen.</p></section> : null}

      <div className={"track-layout " + mode + "-mode-layout"}>
        <div className="track-main">
          {!account && !activeSession ? <section className="account-required-card" aria-labelledby="account-required-title"><p className="eyebrow">Profil fehlt</p><h2 id="account-required-title">Erstelle zuerst dein Profil</h2><p>Sessions und Beobachtungen werden jetzt im Backend gespeichert und deinem Account zugeordnet.</p><a className="button button-primary" href="/account">Profil erstellen oder einloggen</a></section> : null}
          {error ? <section className="account-required-card"><p className="account-error">{error}</p></section> : null}

          {mode === "drill" ? (
            <>
              <A1LearningContent variant="drill" />

              <section className="session-panel" aria-labelledby="session-title"><div><p className="eyebrow">Session</p><h2 id="session-title">Spiel vor der Beobachtung festlegen</h2><p>Erfasse Wettbewerb, Teams, Fokus und die aktuelle Spielzeit. Eine aktive Session muss erst abgeschlossen oder bewusst verworfen werden.</p></div><div className="session-panel-actions"><button className="button button-primary" type="button" onClick={openSetup} disabled={!account}>Session starten</button><button className="button button-secondary test-session-button" type="button" onClick={createDummySession}>Testsession starten</button></div></section>
            </>
          ) : null}

          {isSessionGuardOpen && activeSession ? (
            <section className="session-guard-card" aria-labelledby="session-guard-title">
              <p className="eyebrow">Aktive Session läuft</p>
              <h2 id="session-guard-title">Es läuft bereits eine aktive Session.</h2>
              <p>Du kannst zur aktiven Session zurückkehren, sie sauber abschließen oder sie bewusst verwerfen. Eine neue Session überschreibt niemals still die laufende Session.</p>
              <div className="session-guard-meta"><strong>{activeSession.sessionName}</strong><span>{activeSession.observations.length} Beobachtungen gespeichert</span></div>
              <div className="session-actions"><button className="button button-primary" type="button" onClick={() => setIsSessionGuardOpen(false)}>Zur aktiven Session</button><button className="button button-secondary" type="button" onClick={() => finishSession("completed")} disabled={isSaving}>Session abschließen</button><button className="button danger-button" type="button" onClick={() => finishSession("abandoned")} disabled={isSaving}>Session verwerfen</button></div>
            </section>
          ) : null}

          {isSetupOpen && mode === "drill" ? (
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

          {activeSession ? (
            <>
              <ActiveSessionHeader session={activeSession} statusLabel={isMatchClockPaused ? "pausiert" : matchClockDisplay.label} baseTime={matchClockDisplay.baseTime} stoppageTime={matchClockDisplay.stoppageTime} isPaused={isMatchClockPaused} isSaving={isSaving} isCorrectingTime={isCorrectingTime} onTogglePause={toggleMatchClockPause} onFinish={() => finishSession("completed")} timeControl={<TimeControl value={jumpMatchTime} correctionLabel={formatCorrectionOffset(timeCorrectionSeconds)} isPaused={isMatchClockPaused} period={matchClockPeriod} disabled={!activeSession || isCorrectingTime} message={timeCorrectionMessage} onChange={(value) => setJumpMatchTime(maskMatchTimeInput(value))} onFocus={() => setJumpMatchTime(matchClock)} onStep={updateTimeCorrection} onApply={jumpToMatchTime} onFirstHalf={jumpToFirstHalf} onSecondHalf={jumpToSecondHalf} onTogglePause={toggleMatchClockPause} />} />

              <DrillCompass title="A1 – Anspielbarkeit" observe="Welche realistischen Optionen hat der Ballführer?" trigger="Ein Spieler den Ball kontrolliert erhält und eine Entscheidung möglich ist." onOpenHelp={() => setIsLearningHelpOpen(true)} />

              <section className="live-capture-panel primary-capture-panel" aria-labelledby="observe-title"><div className="observe-header"><div><p className="eyebrow">Primäre Aktion</p><h2 id="observe-title">Beobachtung erfassen</h2></div><button className="capture-button" type="button" onClick={toggleObservationForm}>+ Beobachtung erfassen</button></div>
                {isFormOpen ? <form className="observation-form" onSubmit={(event) => event.preventDefault()}><div className="captured-time-banner"><span>{editingObservationId ? "Bearbeitete Szenenzeit" : "Szenenzeit"}</span><strong>{capturedMatchTime}</strong><small>{editingObservationId ? "Zeitstempel des gespeicherten Eintrags." : "Fixiert beim Klick auf „Beobachtung erfassen“."}</small></div><ChoiceGroup label="Wie viele sinnvolle Optionen hatte der Ballführer?" help="Sinnvolle Optionen sind realistisch spielbare Anschlussaktionen. Zähle nicht jeden Mitspieler auf dem Feld, sondern nur Spieler oder Räume, die tatsächlich angespielt werden könnten." options={optionCounts} value={optionCount} onChange={setOptionCount} /><ChoiceGroup label="Welche Option war die beste?" help="Wähle die Option, die aus deiner Sicht den größten Mehrwert erzeugt hätte. Es geht nicht darum, was tatsächlich gespielt wurde." options={bestOptions} value={bestOption} onChange={setBestOption} /><div className="category-help-grid" aria-label="Kategorien erklärt">{bestOptions.map((option) => <article className={option === bestOption ? "category-help active" : "category-help"} key={option}><h3>{option}</h3><p>{categoryHelp[option].text}</p><small>Beispiel: {categoryHelp[option].example}</small></article>)}</div><ChoiceGroup label="Wurde diese Option gespielt?" help="Vergleiche deine Einschätzung mit der tatsächlichen Entscheidung des Spielers." options={playedOptions} value={played} onChange={setPlayed} /><ChoiceGroup label="Wie endete die Aktion?" help="Bewerte das unmittelbare Ergebnis der gewählten Aktion." options={outcomes} value={outcome} onChange={setOutcome} /><label className="checkbox-field"><input type="checkbox" checked={isInteresting} onChange={(event) => setIsInteresting(event.target.checked)} /> <span>Besonders interessante Szene</span></label><div className="observation-form-actions"><button className="button button-primary" type="button" onClick={saveObservation} disabled={isSaving}>{isSaving ? "Speichere..." : editingObservationId ? "Änderung speichern" : "Beobachtung speichern"}</button>{editingObservationId ? <button className="button button-secondary" type="button" onClick={() => { resetObservationDraft(); setIsFormOpen(false); }} disabled={isSaving}>Bearbeitung abbrechen</button> : null}</div></form> : null}
              </section>

              <section className="live-timeline" aria-labelledby="live-timeline-title"><div className="section-heading compact-heading"><p className="eyebrow">Timeline</p><h2 id="live-timeline-title">Beobachtungen</h2></div>{observations.length ? <div className="live-timeline-list">{observations.map((item) => <ObservationTimelineItem key={item.id} matchTime={item.matchTime || item.time} secondary={item.optionCount + " Optionen"} status={(item.played === "Ja" ? "✓" : item.played === "Nein" ? "✗" : "?") + " " + item.bestOption} isInteresting={item.isInteresting} isSaving={isSaving} onEdit={() => startEditingObservation(item)} onDelete={() => deleteObservation(item)} />)}</div> : <p className="empty-state">Noch keine Beobachtungen gespeichert.</p>}</section>

              <details className="session-stat-panel"><summary><span>Session Statistik</span><strong>{stats.count} Beobachtungen</strong></summary><section className="stats-grid compact-stats" aria-label="Live-Statistik"><article className="stat-card"><span>Beobachtungen</span><strong>{stats.count}</strong></article><article className="stat-card"><span>Ø Optionen</span><strong>{stats.averageOptions}</strong></article><article className="stat-card"><span>Beste Option gespielt</span><strong>{stats.playedRate}%</strong></article></section></details>

              <CollapsibleHelp id="a1-learning-help" open={isLearningHelpOpen} onToggle={setIsLearningHelpOpen}><A1LearningContent variant="live" /></CollapsibleHelp>
            </>
          ) : null}

          {reportSession ? (
            <section className="session-report" aria-labelledby="report-title">
              <p className="eyebrow">Session Report</p><h1 id="report-title">{reportSession.competition}</h1><p className="report-subtitle">{reportSession.teamA} – {reportSession.teamB} · {reportSession.track}</p>
              <div className="report-kpis"><article><span>Beobachtungen</span><strong>{reportStats.count}</strong></article><article><span>Ø Optionen</span><strong>{reportStats.averageOptions}</strong></article><article><span>Beste Option gespielt</span><strong>{reportStats.playedRate}%</strong></article></div>
              <section className="report-section" aria-labelledby="report-timeline-title"><h2 id="report-timeline-title">Timeline</h2>{reportObservations.length ? <div className="live-timeline-list report-timeline-list">{reportObservations.map((item) => <ObservationTimelineItem key={item.id} matchTime={item.matchTime || item.time} secondary={item.optionCount + " Optionen"} status={(item.played === "Ja" ? "✓" : item.played === "Nein" ? "✗" : "?") + " " + item.bestOption} details={item.outcome} isInteresting={item.isInteresting} />)}</div> : <p className="empty-state">Keine Beobachtungen gespeichert.</p>}</section>
              <section className="report-section" aria-labelledby="report-observations-title"><h2 id="report-observations-title">Beobachtungen</h2>{reportObservations.length ? <div className="log-list">{reportObservations.map((item) => <article className={item.isInteresting ? "log-item interesting" : "log-item"} key={item.id}><time>{item.isInteresting ? "★ " : ""}{item.matchTime || item.time}</time><p>Optionen: {item.optionCount}</p><p>Beste Option: {item.bestOption}</p><p>Gespielt: {item.played}</p><p>Ergebnis: {item.outcome}</p></article>)}</div> : <p className="empty-state">Keine Beobachtungen gespeichert.</p>}</section>
              <section className="report-section insights-panel" aria-labelledby="insights-title"><h2 id="insights-title">Erkenntnisse</h2><p>Du erkennst durchschnittlich {reportStats.averageOptions} Optionen pro Szene.</p><p>{reportStats.playedRate >= 60 ? "Die beste Option wurde häufig gespielt." : "Die beste Option wurde seltener gespielt."}</p><p>{reportObservations.some((item) => item.bestOption === "Durchbruch") ? "Du hast Durchbruchoptionen bereits markiert." : "Du bewertest Durchbruchoptionen noch selten als beste Lösung."}</p></section>
              <div className="report-actions"><a className="button button-secondary" href="/sessions">Zum Verlauf</a><button className="button button-primary" type="button" onClick={() => setReportSession(null)}>Neue A1-Session vorbereiten</button></div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function A1LearningContent({ variant }: { variant: "drill" | "live" }) {
  return (
    <div className={variant === "live" ? "a1-learning-stack live-learning-stack" : "a1-learning-stack"}>
      <section className="lesson-box" aria-labelledby={variant === "live" ? "live-goal-title" : "goal-title"}>
        <h2 id={variant === "live" ? "live-goal-title" : "goal-title"}>Lernziel</h2>
        <p>In diesem Track beobachtest du während eines echten Fußballspiels die Optionen des Ballführers.</p>
        <p>Ziel ist es, immer schneller zu erkennen:</p>
        <ul><li>Wer ist anspielbar?</li><li>Wie viele Optionen gibt es?</li><li>Welche Option wäre die beste?</li></ul>
      </section>

      <section className="guide-card" aria-labelledby={variant === "live" ? "live-how-a1-title" : "how-a1-title"}>
        <p className="eyebrow">Anleitung</p>
        <h2 id={variant === "live" ? "live-how-a1-title" : "how-a1-title"}>Wie funktioniert A1?</h2>
        <p>A1 trainiert deine Fähigkeit, Anspieloptionen des Ballführers bewusst wahrzunehmen.</p>
        <p>Während eines echten Spiels beobachtest du Situationen, in denen ein Spieler den Ball kontrolliert erhält und eine Entscheidung treffen kann.</p>
        <p>Deine Aufgabe ist nicht, den Ball zu verfolgen, sondern die verfügbaren Optionen zu erkennen.</p>
        <details className="option-help-details" open>
          <summary><span aria-hidden="true">i</span>Was zählt als Option?</summary>
          <div className="option-help-content">
            <p>Eine Option ist eine realistisch ausführbare nächste Aktion innerhalb der nächsten 1–2 Sekunden.</p>
            <p>Zähle nur Aktionen, die der Ballführer tatsächlich spielen oder ausführen könnte.</p>
            <div className="option-help-grid">
              <div><h3>Zählt als Option</h3><ul><li>Freier Pass zu einem Mitspieler</li><li>Freier Raum zum Andribbeln</li><li>Dribbling gegen einen isolierten Gegenspieler</li><li>Seitenwechsel mit freiem Passweg</li><li>Direkter Pass in einen freien Raum</li></ul></div>
              <div><h3>Zählt nicht als Option</h3><ul><li>Zugestellter Passweg</li><li>Stark bedrängter Mitspieler</li><li>Hoffnungspass ohne realistische Erfolgschance</li><li>Aktionen, die erst nach mehreren Pässen möglich wären</li></ul></div>
            </div>
            <div className="option-rule"><strong>Faustregel</strong><p>Würde ein guter Spieler diese Aktion ernsthaft in Betracht ziehen?</p><p>Wenn ja: Option. Wenn nein: keine Option.</p></div>
          </div>
        </details>
        <div className="option-teaching-note"><p>A1 trainiert nicht das Zählen von Mitspielern.</p><p>A1 trainiert das Erkennen von möglichen Spiellösungen.</p><p>Frage dich nicht: "Wie viele Spieler sehe ich?"</p><p>Frage dich: "Welche Lösungen könnte der Ballführer jetzt tatsächlich wählen?"</p></div>
      </section>

      <section className="guide-card" aria-labelledby={variant === "live" ? "live-when-observe-title" : "when-observe-title"}>
        <p className="eyebrow">Auslöser</p>
        <h2 id={variant === "live" ? "live-when-observe-title" : "when-observe-title"}>Wann sollte ich eine Beobachtung erfassen?</h2>
        <p>Erfasse eine Beobachtung, wenn ein Spieler den Ball kontrolliert erhält und mindestens kurz Zeit hat, eine Entscheidung zu treffen.</p>
        <div className="guide-columns"><div><h3>Geeignete Situationen</h3><ul><li>Innenverteidiger erhält den Ball im Aufbau</li><li>Außenverteidiger wird angespielt</li><li>Sechser erhält den Ball zwischen den Linien</li><li>Flügelspieler nimmt einen Pass an</li></ul></div><div><h3>Weniger geeignete Situationen</h3><ul><li>Kopfballduelle</li><li>Pressschläge</li><li>Zufallsbälle</li><li>abgefälschte Aktionen</li><li>Situationen ohne erkennbare Entscheidungsoption</li></ul></div></div>
      </section>

      <section className="guide-card" aria-labelledby={variant === "live" ? "live-examples-title" : "examples-title"}>
        <p className="eyebrow">Beispiele</p>
        <h2 id={variant === "live" ? "live-examples-title" : "examples-title"}>Optionen einordnen</h2>
        <div className="category-help-grid examples-grid" aria-label="Beispiele für beste Optionen">
          {bestOptions.map((option) => <article className="category-help" key={option}><h3>{option}</h3><p>{categoryHelp[option].text}</p><small>Beispiel: {categoryHelp[option].example}</small></article>)}
        </div>
      </section>
    </div>
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
