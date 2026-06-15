"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AccountUser = {
  id: string;
  profileId: string;
  profileName: string;
  email: string;
  createdAt: string;
};

type AuthResponse = {
  token: string;
  user: AccountUser;
};

const TOKEN_STORAGE_KEY = "pitch-tank.token";
const ACCOUNT_STORAGE_KEY = "pitch-tank.account";

function slugifyName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildProfileId(name: string) {
  const slug = slugifyName(name);
  if (!slug) return "";
  return `user_${slug}`;
}

function storeAuth(payload: AuthResponse) {
  localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(payload.user));
}

export default function AccountPage() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("christoph@example.local");
  const [password, setPassword] = useState("");
  const [profileName, setProfileName] = useState("Christoph");
  const [profileId, setProfileId] = useState("user_christoph");
  const [savedAccount, setSavedAccount] = useState<AccountUser | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AccountUser;
        setSavedAccount(parsed);
        setEmail(parsed.email);
        setProfileName(parsed.profileName);
        setProfileId(parsed.profileId);
      } catch {
        localStorage.removeItem(ACCOUNT_STORAGE_KEY);
      }
    }

    if (!token) return;

    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((user: AccountUser | null) => {
        if (!user) return;
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(user));
        setSavedAccount(user);
        setEmail(user.email);
        setProfileName(user.profileName);
        setProfileId(user.profileId);
      })
      .catch(() => undefined);
  }, []);

  const canSubmit = useMemo(() => {
    if (mode === "login") return email.includes("@") && password.length >= 6;
    return email.includes("@") && password.length >= 6 && profileName.trim().length > 1 && profileId.trim().length > 3;
  }, [email, mode, password, profileId, profileName]);

  function onNameChange(value: string) {
    setProfileName(value);
    setProfileId((current) => {
      if (!current || current.startsWith("user_")) {
        return buildProfileId(value);
      }
      return current;
    });
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSaving) return;

    setIsSaving(true);
    setMessage("");
    setError("");

    const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const payload = mode === "signup"
      ? { email, password, profileName: profileName.trim(), profileId: profileId.trim() }
      : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Account konnte nicht gespeichert werden.");
      }

      const auth = (await response.json()) as AuthResponse;
      storeAuth(auth);
      setSavedAccount(auth.user);
      setProfileName(auth.user.profileName);
      setProfileId(auth.user.profileId);
      setEmail(auth.user.email);
      setMessage(mode === "signup" ? "Account wurde im Backend erstellt." : "Login erfolgreich.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler.");
    } finally {
      setIsSaving(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    localStorage.removeItem("pitch-tank.activeSessionId");
    setSavedAccount(null);
    setMessage("Du bist lokal ausgeloggt.");
  }

  return (
    <main className="account-shell">
      <header className="track-topbar">
        <a className="brand" href="/" aria-label="Zur Pitch-Tank-Startseite">
          <span className="brand-mark" aria-hidden="true">PT</span>
          <span>Pitch Tank</span>
        </a>
        <nav className="nav-links" aria-label="Bereiche">
          <a href="/sessions">Verlauf</a>
          <a href="/tracks/a/a1">A1</a>
          <a href="/">Startseite</a>
        </nav>
      </header>

      <section className="account-hero" aria-labelledby="account-title">
        <p className="eyebrow">Profil</p>
        <h1 id="account-title">Pitch-Tank-Account</h1>
        <p>Dein Profil und deine Sessions werden im Pitch-Tank-Backend gespeichert.</p>
      </section>

      <section className="account-card" aria-labelledby="create-title">
        <div className="account-tabs" aria-label="Account-Modus">
          <button className={mode === "signup" ? "choice active" : "choice"} type="button" onClick={() => setMode("signup")}>
            Account erstellen
          </button>
          <button className={mode === "login" ? "choice active" : "choice"} type="button" onClick={() => setMode("login")}>
            Einloggen
          </button>
        </div>

        <form className="setup-form" onSubmit={submitAccount}>
          <label className="field">
            <span>E-Mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
          </label>

          <label className="field">
            <span>Passwort</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mindestens 6 Zeichen"
              required
            />
          </label>

          {mode === "signup" ? (
            <>
              <label className="field">
                <span>Name</span>
                <input value={profileName} onChange={(event) => onNameChange(event.target.value)} placeholder="z. B. Christoph" required />
              </label>

              <label className="field">
                <span>Profil-ID</span>
                <input value={profileId} onChange={(event) => setProfileId(event.target.value)} placeholder="user_deinname" required />
              </label>
            </>
          ) : null}

          <button className="button button-primary" type="submit" disabled={!canSubmit || isSaving}>
            {isSaving ? "Speichere..." : mode === "signup" ? "Account erstellen" : "Einloggen"}
          </button>
        </form>

        {message ? <p className="account-message">{message}</p> : null}
        {error ? <p className="account-error">{error}</p> : null}

        {savedAccount ? (
          <article className="account-summary" aria-label="Gespeichertes Konto">
            <h3>Aktives Profil</h3>
            <p>Name: {savedAccount.profileName}</p>
            <p>Profil-ID: {savedAccount.profileId}</p>
            <p>E-Mail: {savedAccount.email}</p>
            <p>Erstellt: {new Date(savedAccount.createdAt).toLocaleString("de-DE")}</p>
            <button className="button button-secondary" type="button" onClick={logout}>
              Lokal ausloggen
            </button>
          </article>
        ) : null}
      </section>
    </main>
  );
}
