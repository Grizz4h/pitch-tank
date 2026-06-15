"use client";

import { useEffect, useMemo, useState } from "react";
import worldCup2026 from "@/data/world-cup-2026.json";

type OptionCount = "1" | "2" | "3" | "4" | "5+";
type BestOption = "Sicherheit" | "Raumgewinn" | "Progression" | "Seitenwechsel" | "Durchbruch";
type Played = "Ja" | "Nein" | "Unsicher";
type Outcome = "Ballbesitz gehalten" | "Raumgewinn" | "Druck aufgelöst" | "Ballverlust" | "Torchance";
type FocusPerspective = "Beide Teams" | "Team A" | "Team B";

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
  optionCount: OptionCount;
  bestOption: BestOption;
  played: Played;
  outcome: Outcome;
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
  createdAt: string;
  updatedAt: string;
  observations: Observation[];
};

const TOKEN_STORAGE_KEY = "pitch-tank.token";
const ACCOUNT_STORAGE_KEY = "pitch-tank.account";
const ACTIVE_SESSION_KEY = "pitch-tank.activeSessionId";

const competitions = [
  "WM 2026",
  "EM",
  "Champions League",
  "Europa League",
  "Conference League",
  "Bundesliga",
  "2. Bundesliga",
  "3. Liga",
  "Premier League",
  "La Liga",
  "Serie A",
  "Ligue 1",
  "Sonstige",
];

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

const teamsByCompetition: Record<string, string[]> = {
  [worldCup2026.competition]: Object.values(worldCup2026.groups).flat(),
};

function getTime() {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function getSessionName(competition: string, teamA: string, teamB: string, track: string) {
  if (!competition || !teamA || !teamB || !track) return "Sessionname wird automatisch erzeugt";
  return `${competition} | ${teamA} – ${teamB} | ${track}`;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export default function A1TrackPage() {
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [activeSession, setActiveSession] = useState<StoredSession | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [competition, setCompetition] = useState("WM 2026");
  const [teamA, setTeamA] = useState("Deutschland");
  const [teamB, setTeamB] = useState("Curaçao");
  const [focusPerspective, setFocusPerspective] = useState<FocusPerspective>("Team A");
  const [phase, setPhase] = useState("Gruppenphase Spieltag 1");
  const [selectedTrack, setSelectedTrack] = useState("A1");

  const [optionCount, setOptionCount] = useState<OptionCount>("3");
  const [bestOption, setBestOption] = useState<BestOption>("Raumgewinn");
  const [played, setPlayed] = useState<Played>("Ja");
  const [outcome, setOutcome] = useState<Outcome>("Ballbesitz gehalten");

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
            setActiveSession((await sessionResponse.json()) as StoredSession);
          }
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Account konnte nicht geladen werden.");
      }
    }

    loadAccountAndSession();
  }, []);

  const observations = activeSession?.observations ?? [];
  const teamOptions = teamsByCompetition[competition] ?? [];
  const trackMeta = focusTracks.find((track) => track.code === selectedTrack) ?? focusTracks[0];
  const sessionName = getSessionName(competition, teamA, teamB, selectedTrack);
  const focusTeam = focusPerspective === "Team A" ? teamA : focusPerspective === "Team B" ? teamB : "Beide Teams";
  const canCreateSession = Boolean(token && account && competition && teamA && teamB && focusPerspective && selectedTrack);

  const stats = useMemo(() => {
    const playedDecisions = observations.filter((item) => item.played !== "Unsicher");
    const playedYes = playedDecisions.filter((item) => item.played === "Ja").length;
    const averageOptions = observations.length
      ? observations.reduce((sum, item) => sum + optionValues[item.optionCount], 0) / observations.length
      : 0;

    return {
      count: observations.length,
      averageOptions: observations.length ? averageOptions.toFixed(1) : "0",
      playedRate: playedDecisions.length ? Math.round((playedYes / playedDecisions.length) * 100) : 0,
    };
  }, [observations]);

  function openSetup() {
    setIsSetupOpen(true);
    setIsFormOpen(false);
    setError("");
  }

  function updateCompetition(value: string) {
    setCompetition(value);
    const nextTeams = teamsByCompetition[value] ?? [];
    if (nextTeams.length) {
      setTeamA(nextTeams[0]);
      setTeamB(nextTeams[1] ?? nextTeams[0]);
      return;
    }
    setTeamA("");
    setTeamB("");
    setFocusPerspective("Beide Teams");
  }

  async function createSession() {
    if (!canCreateSession || !token) return;
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ competition, teamA, teamB, focusTeam, focusPerspective, phase, track: selectedTrack, trackTitle: trackMeta.title, sessionName }),
      });
      if (!response.ok) throw new Error("Session konnte nicht erstellt werden.");
      const session = (await response.json()) as StoredSession;
      setActiveSession(session);
      localStorage.setItem(ACTIVE_SESSION_KEY, session.id);
      setIsSetupOpen(false);
      setIsFormOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Session konnte nicht erstellt werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveObservation() {
    if (!activeSession || !token) return;
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ time: getTime(), optionCount, bestOption, played, outcome }),
      });
      if (!response.ok) throw new Error("Beobachtung konnte nicht gespeichert werden.");
      setActiveSession((await response.json()) as StoredSession);
      setIsFormOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Beobachtung konnte nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="track-shell">
      <header className="track-topbar">
        <a className="brand" href="/" aria-label="Zur Pitch-Tank-Startseite">
          <span className="brand-mark" aria-hidden="true">PT</span>
          <span>Pitch Tank</span>
        </a>
        <nav className="nav-links" aria-label="Track-Navigation">
          <a href="/account">Account</a>
          <a href="/sessions">Verlauf</a>
          <a href="/#lernpfade">Lernpfade</a>
        </nav>
      </header>

      <section className="track-hero" aria-labelledby="track-title">
        <p className="eyebrow">Track A · Session 1</p>
        <h1 id="track-title">A1 – Anspielbarkeit beobachten</h1>
        <p>Lerne, Optionen des Ballführers bewusster wahrzunehmen.</p>
      </section>

      <div className="track-layout">
        <div className="track-main">
          {!account ? (
            <section className="account-required-card" aria-labelledby="account-required-title">
              <p className="eyebrow">Profil fehlt</p>
              <h2 id="account-required-title">Erstelle zuerst dein Profil</h2>
              <p>Sessions und Beobachtungen werden jetzt im Backend gespeichert und deinem Account zugeordnet.</p>
              <a className="button button-primary" href="/account">Profil erstellen oder einloggen</a>
            </section>
          ) : null}

          {error ? <section className="account-required-card"><p className="account-error">{error}</p></section> : null}

          {activeSession ? (
            <section className="active-session-card" aria-labelledby="active-session-title">
              <p className="eyebrow">Aktive Session</p>
              <h2 id="active-session-title">{activeSession.sessionName}</h2>
              <div className="active-session-grid">
                <span>{activeSession.competition}</span>
                <span>{activeSession.teamA} – {activeSession.teamB}</span>
                <span>{activeSession.phase || "Phase nicht gesetzt"}</span>
                <span>Fokus: {activeSession.focusTeam}</span>
                <span>Track: {activeSession.track} – {activeSession.trackTitle}</span>
              </div>
            </section>
          ) : null}

          <section className="lesson-box" aria-labelledby="goal-title">
            <h2 id="goal-title">Lernziel</h2>
            <p>In diesem Track beobachtest du während eines echten Fußballspiels die Optionen des Ballführers.</p>
            <p>Ziel ist es, immer schneller zu erkennen:</p>
            <ul>
              <li>Wer ist anspielbar?</li>
              <li>Wie viele Optionen gibt es?</li>
              <li>Welche Option wäre die beste?</li>
            </ul>
          </section>

          <section className="guide-card" aria-labelledby="how-a1-title">
            <p className="eyebrow">Anleitung</p>
            <h2 id="how-a1-title">Wie funktioniert A1?</h2>
            <p>A1 trainiert deine Fähigkeit, Anspieloptionen des Ballführers bewusst wahrzunehmen.</p>
            <p>Während eines echten Spiels beobachtest du Situationen, in denen ein Spieler den Ball kontrolliert erhält und eine Entscheidung treffen kann.</p>
            <p>Deine Aufgabe ist nicht, den Ball zu verfolgen, sondern die verfügbaren Optionen zu erkennen.</p>
          </section>

          <section className="guide-card" aria-labelledby="when-observe-title">
            <p className="eyebrow">Auslöser</p>
            <h2 id="when-observe-title">Wann sollte ich eine Beobachtung erfassen?</h2>
            <p>Erfasse eine Beobachtung, wenn ein Spieler den Ball kontrolliert erhält und mindestens kurz Zeit hat, eine Entscheidung zu treffen.</p>
            <div className="guide-columns">
              <div>
                <h3>Geeignete Situationen</h3>
                <ul>
                  <li>Innenverteidiger erhält den Ball im Aufbau</li>
                  <li>Außenverteidiger wird angespielt</li>
                  <li>Sechser erhält den Ball zwischen den Linien</li>
                  <li>Flügelspieler nimmt einen Pass an</li>
                </ul>
              </div>
              <div>
                <h3>Weniger geeignete Situationen</h3>
                <ul>
                  <li>Kopfballduelle</li>
                  <li>Pressschläge</li>
                  <li>Zufallsbälle</li>
                  <li>abgefälschte Aktionen</li>
                  <li>Situationen ohne erkennbare Entscheidungsoption</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="session-panel" aria-labelledby="session-title">
            <div>
              <p className="eyebrow">Session</p>
              <h2 id="session-title">Spiel vor der Beobachtung festlegen</h2>
              <p>Erfasse zuerst Wettbewerb, Teams und Fokus. Daraus entsteht eine Session im Backend.</p>
              {activeSession ? <span className="session-id">Session-ID: {activeSession.id}</span> : null}
            </div>
            <button className="button button-primary" type="button" onClick={openSetup} disabled={!account}>
              Session starten
            </button>
          </section>

          {isSetupOpen ? (
            <section className="setup-card" aria-labelledby="setup-title">
              <div className="section-heading compact-heading">
                <p className="eyebrow">Session-Setup</p>
                <h2 id="setup-title">Welches Spiel beobachtest du?</h2>
              </div>

              <form className="setup-form" onSubmit={(event) => event.preventDefault()}>
                <label className="field">
                  <span>Wettbewerb</span>
                  <select value={competition} onChange={(event) => updateCompetition(event.target.value)} required>
                    {competitions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>

                <div className="field-grid">
                  <label className="field">
                    <span>Team A</span>
                    <select value={teamA} onChange={(event) => setTeamA(event.target.value)} required disabled={!teamOptions.length}>
                      {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Team B</span>
                    <select value={teamB} onChange={(event) => setTeamB(event.target.value)} required disabled={!teamOptions.length}>
                      {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
                    </select>
                  </label>
                </div>

                {!teamOptions.length ? <p className="form-hint">Aktuell sind Teamdaten nur für die WM 2026 hinterlegt.</p> : null}

                <fieldset className="choice-group setup-choice">
                  <legend>Welches Team beobachtest du hauptsächlich?</legend>
                  <div>
                    {(["Beide Teams", "Team A", "Team B"] as FocusPerspective[]).map((option) => (
                      <button className={option === focusPerspective ? "choice active" : "choice"} key={option} type="button" onClick={() => setFocusPerspective(option)}>
                        {option === "Team A" && teamA ? teamA : option === "Team B" && teamB ? teamB : option}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="field">
                  <span>Phase / Spieltag</span>
                  <input list="phase-examples" value={phase} onChange={(event) => setPhase(event.target.value)} placeholder="Gruppenphase Spieltag 1" />
                  <datalist id="phase-examples">
                    {phaseExamples.map((example) => <option key={example} value={example} />)}
                  </datalist>
                </label>

                <label className="field">
                  <span>Fokus-Track</span>
                  <select value={selectedTrack} onChange={(event) => setSelectedTrack(event.target.value)} required>
                    {focusTracks.map((track) => <option key={track.code} value={track.code}>{track.code} – {track.title}</option>)}
                  </select>
                </label>

                <div className="generated-session-name">
                  <span>Sessionname</span>
                  <strong>{sessionName}</strong>
                </div>

                <button className="button button-primary" type="button" onClick={createSession} disabled={!canCreateSession || isSaving}>
                  {isSaving ? "Speichere..." : "Setup abschließen und Session starten"}
                </button>
              </form>
            </section>
          ) : null}

          <section className="stats-grid" aria-label="Live-Statistik">
            <article className="stat-card"><span>Beobachtungen</span><strong>{stats.count}</strong></article>
            <article className="stat-card"><span>Durchschnittlich erkannte Optionen</span><strong>{stats.averageOptions}</strong></article>
            <article className="stat-card"><span>Beste Option gespielt</span><strong>{stats.playedRate}%</strong></article>
          </section>

          <section className="observation-area" aria-labelledby="observe-title">
            <div className="observe-header">
              <div>
                <p className="eyebrow">Beobachtung erfassen</p>
                <h2 id="observe-title">Optionen im Spielmoment</h2>
              </div>
              <button className="capture-button" type="button" onClick={() => setIsFormOpen((current) => !current)} disabled={!activeSession}>
                + Beobachtung erfassen
              </button>
            </div>

            {!activeSession ? <p className="empty-state">Schließe zuerst das Session-Setup ab, um Beobachtungen zu erfassen.</p> : null}

            {isFormOpen && activeSession ? (
              <form className="observation-form" onSubmit={(event) => event.preventDefault()}>
                <ChoiceGroup label="Wie viele sinnvolle Optionen hatte der Ballführer?" help="Sinnvolle Optionen sind realistisch spielbare Anschlussaktionen. Zähle nicht jeden Mitspieler auf dem Feld, sondern nur Spieler oder Räume, die tatsächlich angespielt werden könnten." options={optionCounts} value={optionCount} onChange={setOptionCount} />
                <ChoiceGroup label="Welche Option war die beste?" help="Wähle die Option, die aus deiner Sicht den größten Mehrwert erzeugt hätte. Es geht nicht darum, was tatsächlich gespielt wurde." options={bestOptions} value={bestOption} onChange={setBestOption} />
                <div className="category-help-grid" aria-label="Kategorien erklärt">
                  {bestOptions.map((option) => (
                    <article className={option === bestOption ? "category-help active" : "category-help"} key={option}>
                      <h3>{option}</h3>
                      <p>{categoryHelp[option].text}</p>
                      <small>Beispiel: {categoryHelp[option].example}</small>
                    </article>
                  ))}
                </div>
                <ChoiceGroup label="Wurde diese Option gespielt?" help="Vergleiche deine Einschätzung mit der tatsächlichen Entscheidung des Spielers." options={playedOptions} value={played} onChange={setPlayed} />
                <ChoiceGroup label="Wie endete die Aktion?" help="Bewerte das unmittelbare Ergebnis der gewählten Aktion." options={outcomes} value={outcome} onChange={setOutcome} />
                <button className="button button-primary" type="button" onClick={saveObservation} disabled={isSaving}>
                  {isSaving ? "Speichere..." : "Beobachtung speichern"}
                </button>
              </form>
            ) : null}
          </section>

          <section className="session-log" aria-labelledby="log-title">
            <div className="section-heading compact-heading"><p className="eyebrow">Session-Log</p><h2 id="log-title">Gespeicherte Beobachtungen</h2></div>
            {observations.length ? (
              <div className="log-list">
                {observations.map((item) => (
                  <article className="log-item" key={item.id}>
                    <time>{item.time}</time><p>Optionen: {item.optionCount}</p><p>Beste Option: {item.bestOption}</p><p>Gespielt: {item.played}</p><p>Ergebnis: {item.outcome}</p>
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">Noch keine Beobachtungen gespeichert.</p>}
          </section>
        </div>

        <aside className="observation-flow" aria-labelledby="flow-title">
          <p className="eyebrow">Lernhilfe</p><h2 id="flow-title">Beobachtungsablauf</h2>
          <ol><li>Spieler erhält den Ball.</li><li>Optionen erkennen.</li><li>Beste Option bestimmen.</li><li>Tatsächliche Entscheidung vergleichen.</li><li>Ergebnis bewerten.</li></ol>
        </aside>
      </div>
    </main>
  );
}

function ChoiceGroup<T extends string>({ label, help, options, value, onChange }: { label: string; help?: string; options: T[]; value: T; onChange: (value: T) => void }) {
  return (
    <fieldset className="choice-group">
      <legend>{label}</legend>
      {help ? <p className="choice-help">{help}</p> : null}
      <div>
        {options.map((option) => (
          <button className={option === value ? "choice active" : "choice"} key={option} type="button" onClick={() => onChange(option)}>{option}</button>
        ))}
      </div>
    </fieldset>
  );
}
