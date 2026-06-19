import type { MatchClockPeriod } from "@/types/pitch";

type TimeControlProps = {
  value: string;
  correctionLabel: string;
  isPaused: boolean;
  period: MatchClockPeriod;
  disabled?: boolean;
  message?: string;
  interestingScenes?: React.ReactNode;
  onChange: (value: string) => void;
  onFocus: () => void;
  onStep: (seconds: number) => void;
  onApply: () => void;
  onFirstHalf: () => void;
  onSecondHalf: () => void;
  onTogglePause: () => void;
};

export function TimeControl({ value, correctionLabel, isPaused, period, disabled = false, message, interestingScenes, onChange, onFocus, onStep, onApply, onFirstHalf, onSecondHalf, onTogglePause }: TimeControlProps) {
  return (
    <div className="time-control-popover">
      <p className="eyebrow">Spielzeit korrigieren</p>
      {interestingScenes}
      <div className="time-correction-note time-correction-form">
        <span>{isPaused ? "Uhr pausiert" : "Uhr läuft"} · Korrektur <b>{correctionLabel}</b></span>
        <input className="time-jump-input" aria-label="Spielzeit im Format mm:ss" value={value} onChange={(event) => onChange(event.target.value)} onFocus={onFocus} inputMode="numeric" placeholder="45:00" disabled={disabled} />
        <div className="time-correction-buttons" role="group" aria-label="Spielzeit korrigieren">
          <button type="button" onClick={() => onStep(-60)} disabled={disabled}>-1min</button>
          <button type="button" onClick={() => onStep(-10)} disabled={disabled}>-10s</button>
          <button type="button" onClick={() => onStep(-1)} disabled={disabled}>-1s</button>
          <button type="button" onClick={() => onStep(1)} disabled={disabled}>+1s</button>
          <button type="button" onClick={() => onStep(10)} disabled={disabled}>+10s</button>
          <button type="button" onClick={() => onStep(60)} disabled={disabled}>+1min</button>
        </div>
        <button className="time-apply-button" type="button" onClick={onApply} disabled={disabled}>Zeit übernehmen</button>
        <div className="time-period-control" role="group" aria-label="Spielabschnitt wählen">
          <button className={!isPaused && period === "first" ? "active" : ""} type="button" onClick={onFirstHalf} disabled={disabled}>1. Halbzeit</button>
          <button className={!isPaused && period === "second" ? "active" : ""} type="button" onClick={onSecondHalf} disabled={disabled}>2. Halbzeit</button>
          <button className={isPaused ? "active" : ""} type="button" onClick={onTogglePause} disabled={disabled}>Pause</button>
        </div>
        {message ? <small>{message}</small> : null}
      </div>
    </div>
  );
}
