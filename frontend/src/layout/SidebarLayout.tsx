import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Inbox,
  Kanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Plus,
  Star,
  Tags,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import "./SidebarLayout.css";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Tasks",
    items: [
      { to: "/tasks", label: "Manage Tasks", icon: ListChecks },
      { to: "/add-task", label: "Add Task", icon: Plus },
      { to: "/categories", label: "Categories", icon: Tags },
    ],
  },
  {
    title: "Clients",
    items: [
      { to: "/followup-clients", label: "Client Followup", icon: PhoneCall },
      { to: "/pipeline-clients", label: "Client Pipeline", icon: Kanban },
    ],
  },
  {
    title: "Leads",
    items: [
      { to: "/leads", label: "Leads", icon: Inbox },
      {
        to: "/important-client-leads",
        label: "Important Client Lead",
        icon: Star,
      },
    ],
  },
];

const COLLAPSE_KEY = "vpdm.sidebarCollapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function initialsOf(
  firstName: string | undefined,
  lastName: string | undefined,
  email: string | undefined
): string {
  const a = (firstName ?? "").trim();
  const b = (lastName ?? "").trim();
  if (a || b) return `${a.charAt(0)}${b.charAt(0)}`.toUpperCase();
  return (email ?? "?").charAt(0).toUpperCase();
}

export function SidebarLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Remembering the choice is a convenience; the toggle still works without it.
      }
      return next;
    });
  };
  const location = useLocation();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Close the drawer and account menu whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    // Each page starts at its title, not wherever the last page was scrolled to.
    bodyRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const fullName = [user?.firstName, user?.lastName]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const currentGroup = NAV_GROUPS.find((g) =>
    g.items.some((i) => i.to === location.pathname)
  );
  const currentLabel =
    currentGroup?.items.find((i) => i.to === location.pathname)?.label ??
    (location.pathname === "/profile" ? "Profile" : "VPDM");
  // "Leads / Leads" says the same thing twice; show the group only when it adds something.
  const showGroup = currentGroup !== undefined && currentGroup.title !== currentLabel;

  useEffect(() => {
    document.title = `${currentLabel} – VPDM Task Manager`;
    return () => {
      document.title = "VPDM Task Manager";
    };
  }, [currentLabel]);

  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <aside
        className={`app-sidebar ${mobileOpen ? "open" : ""}`}
        aria-label="Main menu"
      >
        <div className="app-brand">
          <span className="app-brand-mark">
            <img className="app-brand-logo" src="/logo.svg" alt="" />
          </span>
          <span className="app-brand-text">
            <strong>VPDM</strong>
            <small>Task Manager</small>
          </span>
          <button
            type="button"
            className="app-sidebar-close"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="app-nav">
          {NAV_GROUPS.map((group) => (
            <div className="app-nav-group" key={group.title}>
              <p className="app-nav-heading">{group.title}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => (isActive ? "on" : "")}
                  title={collapsed ? label : undefined}
                >
                  <Icon size={17} strokeWidth={2} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
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
            className="menu-trigger"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={19} aria-hidden="true" />
            )}
          </button>
          <div className="app-topbar-title">
            {showGroup ? (
              <span className="app-topbar-group">{currentGroup.title}</span>
            ) : null}
            <strong>{currentLabel}</strong>
          </div>
          <div className="app-user" ref={userMenuRef}>
            <button
              type="button"
              className="app-user-trigger"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              aria-label="Account menu"
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="app-user-avatar" aria-hidden="true">
                {initialsOf(user?.firstName, user?.lastName, user?.email)}
              </span>
              <span className="app-user-text">
                {fullName ? <strong>{fullName}</strong> : null}
                <small>{user?.email}</small>
              </span>
              <ChevronDown
                className="app-user-chevron"
                size={16}
                aria-hidden="true"
              />
            </button>
            {userMenuOpen ? (
              <div className="app-user-menu" role="menu">
                <div className="app-user-menu-head">
                  {fullName ? <strong>{fullName}</strong> : null}
                  <small>{user?.email}</small>
                </div>
                <Link to="/profile" role="menuitem" className="app-user-menu-item">
                  <UserRound size={16} aria-hidden="true" />
                  Profile
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="app-user-menu-item"
                  onClick={() => void logout()}
                >
                  <LogOut size={16} aria-hidden="true" />
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <div className="app-body" ref={bodyRef}>
          <div className="app-main">
            <Outlet />
          </div>
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} VPDM. All rights reserved.</span>
            <span>VPDM Task Manager</span>
          </footer>
        </div>
      </section>
    </div>
  );
}
