import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { toastApiError, toastSuccess } from "../toast";
import "./auth-pages.css";

export function RegisterPage() {
  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      toastApiError(new Error("Password must be at least 8 characters."));
      return;
    }
    setBusy(true);
    try {
      await register(email.trim(), password);
      toastSuccess("Registration successful");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      toastApiError(err, "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-page">
      <div className="auth-card panel">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1 className="auth-title">Create account</h1>
            <p className="auth-sub">Daily Task Board</p>
          </div>
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
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <span className="hint">At least 8 characters</span>
          </label>
          <button type="submit" className="btn primary auth-submit" disabled={busy}>
            {busy ? "Creating..." : "Register"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
