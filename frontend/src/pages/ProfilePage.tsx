import { useEffect, useState, type FormEvent } from "react";
import { apiSendJson } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { AuthUser } from "../auth/types";
import { PasswordInput } from "../components/PasswordInput";
import { toastApiError, toastSuccess } from "../toast";
import {
  DEFAULT_TEXT_SIZE,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  clampTextSize,
  loadTextSize,
  saveTextSize,
} from "../textSize";
import "./profile-page.css";

function initialsOf(first: string, last: string, email: string): string {
  const a = first.trim();
  const b = last.trim();
  if (a || b) return `${a.charAt(0)}${b.charAt(0)}`.toUpperCase();
  return email.charAt(0).toUpperCase() || "?";
}

export function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<number>(loadTextSize);
  /** What is typed in the box; applied once it is a valid size. */
  const [textSizeInput, setTextSizeInput] = useState(() => String(loadTextSize()));

  const changeTextSize = (px: number) => {
    const size = clampTextSize(px);
    setTextSize(size);
    setTextSizeInput(String(size));
    saveTextSize(size);
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError("The new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("The new password and its confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPwError("Choose a new password that is different from the current one.");
      return;
    }
    setPwBusy(true);
    try {
      await apiSendJson("/auth/change-password", "POST", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toastSuccess("Password changed");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not change password");
      toastApiError(err, "Could not change password");
    } finally {
      setPwBusy(false);
    }
  };

  useEffect(() => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
  }, [user?.firstName, user?.lastName]);

  const email = user?.email ?? "";
  const savedFirst = user?.firstName ?? "";
  const savedLast = user?.lastName ?? "";
  const changed =
    firstName.trim() !== savedFirst.trim() || lastName.trim() !== savedLast.trim();
  const fullName = [savedFirst, savedLast]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter both a first name and a last name.");
      return;
    }
    setBusy(true);
    try {
      await apiSendJson<{ user: AuthUser }>("/auth/profile", "PATCH", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      await refresh();
      toastSuccess("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
      toastApiError(err, "Could not save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="profile-page">
      <header>
        <h1 className="profile-title">Profile</h1>
        <p className="profile-subtitle">Your account details for VPDM Task Manager.</p>
      </header>

      <section className="panel profile-card">
        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">
            {initialsOf(savedFirst, savedLast, email)}
          </span>
          <div className="profile-identity-text">
            <strong>{fullName || "No name set"}</strong>
            <span>{email}</span>
          </div>
        </div>

        <form className="profile-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="profile-row">
            <label className="field">
              <span className="label">First name</span>
              <input
                className="input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                maxLength={120}
                required
              />
            </label>
            <label className="field">
              <span className="label">Last name</span>
              <input
                className="input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                maxLength={120}
                required
              />
            </label>
          </div>
          <label className="field">
            <span className="label">Email</span>
            <input className="input" value={email} readOnly disabled />
            <span className="profile-hint">
              You sign in with this email. It cannot be changed here.
            </span>
          </label>

          {error ? (
            <p className="profile-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="profile-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => void logout()}
            >
              Log out
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !changed}
            >
              {busy ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel profile-card">
        <div className="profile-section-head">
          <h2>Text size</h2>
          <p>
            Set the text size for the whole app on this device, from {MIN_TEXT_SIZE} to{" "}
            {MAX_TEXT_SIZE}. The default is {DEFAULT_TEXT_SIZE}.
          </p>
        </div>
        <div className="profile-text-size">
          <button
            type="button"
            className="btn ghost profile-text-size-step"
            aria-label="Decrease text size"
            disabled={textSize <= MIN_TEXT_SIZE}
            onClick={() => changeTextSize(textSize - 1)}
          >
            −
          </button>
          <input
            className="input profile-text-size-input"
            type="number"
            inputMode="numeric"
            aria-label="Text size"
            min={MIN_TEXT_SIZE}
            max={MAX_TEXT_SIZE}
            step={1}
            value={textSizeInput}
            onChange={(e) => {
              setTextSizeInput(e.target.value);
              const px = Number(e.target.value);
              if (Number.isInteger(px) && px >= MIN_TEXT_SIZE && px <= MAX_TEXT_SIZE) {
                setTextSize(px);
                saveTextSize(px);
              }
            }}
            onBlur={() => changeTextSize(Number(textSizeInput) || textSize)}
          />
          <button
            type="button"
            className="btn ghost profile-text-size-step"
            aria-label="Increase text size"
            disabled={textSize >= MAX_TEXT_SIZE}
            onClick={() => changeTextSize(textSize + 1)}
          >
            +
          </button>
          <button
            type="button"
            className="btn ghost profile-text-size-reset"
            disabled={textSize === DEFAULT_TEXT_SIZE}
            onClick={() => changeTextSize(DEFAULT_TEXT_SIZE)}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="panel profile-card">
        <div className="profile-section-head">
          <h2>Change password</h2>
          <p>Enter your current password, then choose a new one of at least 8 characters.</p>
        </div>
        <form className="profile-form" onSubmit={(e) => void onChangePassword(e)}>
          <label className="field profile-field-narrow">
            <span className="label">Current password</span>
            <PasswordInput
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
          </label>
          <div className="profile-row">
            <label className="field">
              <span className="label">New password</span>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            <label className="field">
              <span className="label">Confirm new password</span>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                minLength={8}
              />
            </label>
          </div>

          {pwError ? (
            <p className="profile-error" role="alert">
              {pwError}
            </p>
          ) : null}

          <div className="profile-actions profile-actions-end">
            <button
              type="submit"
              className="btn primary"
              disabled={
                pwBusy || !currentPassword || !newPassword || !confirmPassword
              }
            >
              {pwBusy ? "Changing..." : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
