type DrillCompassProps = {
  title: string;
  observe: string;
  trigger: string;
  onOpenHelp: () => void;
};

export function DrillCompass({ title, observe, trigger, onOpenHelp }: DrillCompassProps) {
  return (
    <section className="drill-compass" aria-labelledby="drill-compass-title">
      <div><p className="eyebrow">Drill-Kompass</p><h2 id="drill-compass-title">{title}</h2></div>
      <dl>
        <div><dt>Beobachte:</dt><dd>{observe}</dd></div>
        <div><dt>Erfassen wenn:</dt><dd>{trigger}</dd></div>
      </dl>
      <button type="button" onClick={onOpenHelp}>Lernhilfe öffnen</button>
    </section>
  );
}
