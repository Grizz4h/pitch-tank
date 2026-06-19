import type { ReactNode } from "react";

type CollapsibleHelpProps = {
  id: string;
  open: boolean;
  summary?: string;
  children: ReactNode;
  onToggle: (open: boolean) => void;
};

export function CollapsibleHelp({ id, open, summary = "Lernhilfe einblenden", children, onToggle }: CollapsibleHelpProps) {
  return (
    <details className="learning-help-panel" id={id} open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
      <summary>{summary}</summary>
      <div className="learning-help-content">{children}</div>
    </details>
  );
}
