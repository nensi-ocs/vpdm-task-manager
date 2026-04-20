import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "./SidebarLayout.css";

export function SidebarLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isTaskMenuActive =
    location.pathname === "/tasks" || location.pathname === "/add-task";
  const [taskMenuOpen, setTaskMenuOpen] = useState(isTaskMenuActive);

  useEffect(() => {
    setTaskMenuOpen(isTaskMenuActive);
  }, [isTaskMenuActive]);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="app-brand">
          <img className="app-brand-logo" src="/logo.svg" alt="VPDM logo" />
          <span>VPDM</span>
        </div>
        <nav className="app-nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => (isActive ? "on" : "")}
            onClick={() => setMobileOpen(false)}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/calendar"
            className={({ isActive }) => (isActive ? "on" : "")}
            onClick={() => setMobileOpen(false)}
          >
            Calendar
          </NavLink>
          <button
            type="button"
            className={`app-nav-parent ${isTaskMenuActive ? "on" : ""}`}
            aria-expanded={taskMenuOpen}
            onClick={() => setTaskMenuOpen((v) => !v)}
          >
            Task Manager
          </button>
          {taskMenuOpen ? (
            <div className="app-subnav">
              <NavLink
                to="/tasks"
                className={({ isActive }) => (isActive ? "on" : "")}
                onClick={() => setMobileOpen(false)}
              >
                Manage Tasks
              </NavLink>
              <NavLink
                to="/add-task"
                className={({ isActive }) => (isActive ? "on" : "")}
                onClick={() => setMobileOpen(false)}
              >
                Add Task
              </NavLink>
            </div>
          ) : null}
          <NavLink
            to="/categories"
            className={({ isActive }) => (isActive ? "on" : "")}
            onClick={() => setMobileOpen(false)}
          >
            Categories
          </NavLink>
          <NavLink
            to="/followup-clients"
            className={({ isActive }) => (isActive ? "on" : "")}
            onClick={() => setMobileOpen(false)}
          >
            Client Followup
          </NavLink>
          <NavLink
            to="/pipeline-clients"
            className={({ isActive }) => (isActive ? "on" : "")}
            onClick={() => setMobileOpen(false)}
          >
            Client Pipeline
          </NavLink>
          <NavLink
            to="/leads"
            className={({ isActive }) => (isActive ? "on" : "")}
            onClick={() => setMobileOpen(false)}
          >
            Leads
          </NavLink>
        </nav>
      </aside>
      {mobileOpen ? (
        <button
          type="button"
          className="app-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      ) : null}
      <section className="app-content">
        <header className="app-topbar">
          <button
            type="button"
            className="btn ghost sm menu-trigger"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            ☰
          </button>
          <div className="app-topbar-user" title={user?.email}>
            {user?.email}
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => void logout()}
          >
            Log out
          </button>
        </header>
        <div className="app-body">
          <Outlet />
        </div>
      </section>
    </div>
  );
}
