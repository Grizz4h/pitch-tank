export type FocusPerspective = "Beide Teams" | "Team A" | "Team B";
export type MatchClockPeriod = "first" | "second";
export type SessionStatus = "active" | "completed" | "abandoned";

export type MatchTimeMeta = {
  totalSeconds: number;
  baseTime: string;
  stoppageTime: string | null;
  periodLabel: string;
};

export type PitchObservation = {
  id: string;
  time: string;
  matchTime?: string;
  matchTimeMeta?: MatchTimeMeta;
  isInteresting?: boolean;
  track?: string;
  optionCount?: string;
  bestOption?: string;
  played?: string;
  pressureLevel?: string;
  pressureDirection?: string;
  timeWindow?: string;
  solutionQuality?: string;
  outcome: string;
  createdAt?: string;
};

export type StoredSession = {
  id: string;
  profileId: string;
  profileName: string;
  competition: string;
  teamA: string;
  teamB: string;
  focusTeam: string;
  focusPerspective?: FocusPerspective;
  phase: string;
  track: string;
  trackTitle: string;
  sessionName: string;
  sessionStartMatchTime?: string;
  sessionStartTimestamp?: string;
  matchTimeCorrectionSeconds?: number;
  isMatchClockPaused?: boolean;
  matchClockPausedSeconds?: number | null;
  matchClockPeriod?: MatchClockPeriod;
  status?: SessionStatus;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  observations: PitchObservation[];
};
