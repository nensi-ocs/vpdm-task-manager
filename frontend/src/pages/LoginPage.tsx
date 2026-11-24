import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { toastApiError, toastSuccess } from "../toast";
import { AuthAside } from "./AuthAside";
import { PasswordInput } from "../components/PasswordInput";
import "./auth-pages.css";

export function LoginPage() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      toastSuccess("Login successful");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      toastApiError(err, "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
      <AuthAside />
      <div className="auth-card panel">
        <div className="auth-brand">
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-sub">Welcome back. Sign in to see today's tasks.</p>
        </div>
        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="btn primary auth-submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="auth-footer">
          No account? <Link to="/register">Create one</Link>
        </p>
      </div>
      </div>
    </div>
  );
}
