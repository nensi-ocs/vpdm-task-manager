import { Check } from "lucide-react";

/** Brand panel shown beside the sign-in and create-account forms. */
export function AuthAside() {
  return (
    <aside className="auth-aside">
      <div className="auth-aside-brand">
        <span className="brand-mark" aria-hidden />
        <strong>VPDM</strong>
      </div>
      <div className="auth-aside-copy">
        <h2>The day's work, checked off.</h2>
        <ul>
          <li>
            <Check size={17} aria-hidden="true" />
            Daily, weekly and monthly tasks
          </li>
          <li>
            <Check size={17} aria-hidden="true" />
            Client follow-ups by track
          </li>
          <li>
            <Check size={17} aria-hidden="true" />
            Leads and pipeline in one place
          </li>
        </ul>
      </div>
    </aside>
  );
}
