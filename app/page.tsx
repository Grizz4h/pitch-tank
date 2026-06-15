const dashboardCards = [
  {
    title: "Weiter trainieren",
    content: "Track A - Wahrnehmen & Raum lesen",
    action: "A1 starten",
  },
  {
    title: "Nächster Fokus",
    content: "Anspielbarkeit, freie Räume und erste Optionen erkennen",
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
  return (
    <main className="site-shell">
      <header className="site-header" aria-label="Hauptnavigation">
        <a className="brand" href="#top" aria-label="Pitch Tank Startseite">
          <span className="brand-mark" aria-hidden="true">PT</span>
          <span>Pitch Tank</span>
        </a>
        <nav className="nav-links" aria-label="Bereiche">
          <a href="#dashboard">Dashboard</a>
          <a href="#lernpfade">Lernpfade</a>
          <a href="#sessions">Sessions</a>
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
              Training starten
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
            <h2>Anspielbarkeit erkennen</h2>
            <p>Freie Räume, Druckwinkel und erste Optionen vor dem Ballkontakt lesen.</p>
          </div>
        </aside>
      </section>

      <section id="dashboard" className="dashboard-section" aria-labelledby="dashboard-title">
        <div className="section-heading compact-heading">
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">Dein nächster Schritt</h2>
        </div>

        <div className="dashboard-grid">
          {dashboardCards.map((card) => (
            <article className="dashboard-card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.content}</p>
              {card.action ? <a href="/tracks/a/a1">{card.action}</a> : null}
              {card.note ? <span>{card.note}</span> : null}
            </article>
          ))}
        </div>
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
