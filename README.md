# Pitch Tank

Pitch Tank ist das technische Gegenstück zu academy-web auf Basis von Next.js und TypeScript. Das Projekt ist bewusst minimal gehalten und fokussiert sich zunächst auf Infrastruktur, Build-Verhalten und Deployment-Kompatibilität.

## Technische Blaupause

- Next.js App Router mit TypeScript
- Standalone Build für spätere einfache Deployment-Verpackung
- Port 5174 für das Frontend, passend zur bestehenden academy-web-Frontend-Konvention
- Startskripte im Stil von academy-web: `start.sh` und `start_all.sh`
- Keine Backend-Logik im ersten Schritt, aber eine Platzhalter-Datei für spätere Ergänzungen

## Vergleich zu academy-web

- `academy-web` nutzt ein separates Frontend-Verzeichnis mit Vite und ein Python-Backend auf Port 8000.
- Im Workspace sind keine eigenen Systemd- oder Nginx-Dateien für `academy-web` auffindbar.
- Das deploymentseitige Zielbild bleibt gleich: Reverse Proxy vor dem Frontend, spätere API-Erweiterung über `/api` möglich.

## Start

```bash
npm install
npm run dev
```

Für die lokale Laufzeit verwenden die Skripte Port 5174, damit sich das Projekt konsistent wie das bestehende Frontend verhält.