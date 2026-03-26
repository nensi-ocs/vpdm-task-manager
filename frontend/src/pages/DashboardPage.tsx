import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTasks } from "../useTasks";
import { useFollowupClients } from "../useFollowupClients";
import { VPDM_TRACKS } from "../vpdmCatalog";
import type { Task } from "../types";
import "./dashboard-page.css";
import { Pagination } from "../components/Pagination";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function ymdInKolkata(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function todayIsoKolkata(): string {
  return ymdInKolkata(new Date());
}

function isoToUtcMidday(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function addDaysUtc(utcDate: Date, days: number): Date {
  return new Date(utcDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonthUTC(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function isWeekdayOption(
  val: string | null
): val is (typeof WEEKDAYS)[number] {
  return val !== null && (WEEKDAYS as readonly string[]).includes(val);
}

function sortForList(list: Task[]): Task[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function displayDate(selectedIso: string): string {
  const selected = new Date(`${selectedIso}T12:00:00.000Z`);
  return selected.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function taskMatchesQuery(t: Task, queryLower: string): boolean {
  if (!queryLower) return true;
  const title = t.title.toLowerCase();
  const cat = (t.category ?? "").toLowerCase();
  const freq = t.frequency.toLowerCase();
  const notes = (t.notes ?? "").toLowerCase();
  return (
    title.includes(queryLower) ||
    cat.includes(queryLower) ||
    freq.includes(queryLower) ||
    notes.includes(queryLower)
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() =>
    todayIsoKolkata()
  );
  const [taskSearch, setTaskSearch] = useState("");
  const { tasks, loading, error, completedTaskIds, setTaskCompletionForDate } =
    useTasks(user?.id, selectedDateIso);
  const {
    clients: followupClients,
    grouped: followupGrouped,
    loading: followupLoading,
    error: followupError,
    completedClientIds,
    setClientCompletionForDate,
  } = useFollowupClients(user?.id, selectedDateIso);

  const followupCompletedCount = useMemo(
    () => followupClients.filter((c) => completedClientIds.includes(c.id)).length,
    [followupClients, completedClientIds]
  );
  const followupPendingCount = followupClients.length - followupCompletedCount;

  const tasksForSelectedDate = useCallback(
    (t: Task) => {
      const seriesStartIso = t.startDate;
      if (selectedDateIso < seriesStartIso) return false;
      if (t.endDate && selectedDateIso > t.endDate) return false;

      if (t.frequency === "daily") return true;

      if (t.frequency === "weekly") {
        if (!isWeekdayOption(t.repeatWeekday)) return false;

        const startDate = isoToUtcMidday(seriesStartIso);
        const startDow = startDate.getUTCDay();
        const targetDow = WEEKDAYS.indexOf(t.repeatWeekday);
        const diff = (targetDow - startDow + 7) % 7;
        const firstDue = addDaysUtc(startDate, diff);

        const selectedDate = isoToUtcMidday(selectedDateIso);
        const msDay = 24 * 60 * 60 * 1000;
        const daysDiff = Math.round(
          (selectedDate.getTime() - firstDue.getTime()) / msDay
        );
        return daysDiff >= 0 && daysDiff % 7 === 0;
      }

      if (t.frequency === "monthly") {
        if (typeof t.repeatDayOfMonth !== "number") return false;
        const repeatDom = t.repeatDayOfMonth;

        const selectedDate = isoToUtcMidday(selectedDateIso);
        const selectedYear = selectedDate.getUTCFullYear();
        const selectedMonth0 = selectedDate.getUTCMonth();

        const expectedDueDay = Math.min(
          repeatDom,
          lastDayOfMonthUTC(selectedYear, selectedMonth0)
        );
        const expectedIso = `${selectedYear}-${pad2(
          selectedMonth0 + 1
        )}-${pad2(expectedDueDay)}`;
        if (expectedIso !== selectedDateIso) return false;

        const startDate = isoToUtcMidday(seriesStartIso);
        const startYear = startDate.getUTCFullYear();
        const startMonth0 = startDate.getUTCMonth();

        const startDueDay = Math.min(
          repeatDom,
          lastDayOfMonthUTC(startYear, startMonth0)
        );
        const startDueIso = `${startYear}-${pad2(startMonth0 + 1)}-${pad2(
          startDueDay
        )}`;

        let firstDueIso = startDueIso;
        if (startDueIso < seriesStartIso) {
          const next = new Date(Date.UTC(startYear, startMonth0 + 1, 1));
          const nextYear = next.getUTCFullYear();
          const nextMonth0 = next.getUTCMonth();
          const nextDueDay = Math.min(
            repeatDom,
            lastDayOfMonthUTC(nextYear, nextMonth0)
          );
          firstDueIso = `${nextYear}-${pad2(nextMonth0 + 1)}-${pad2(nextDueDay)}`;
        }

        return selectedDateIso >= firstDueIso;
      }

      if (t.frequency === "interval") {
        if (
          typeof t.repeatIntervalDays !== "number" ||
          t.repeatIntervalDays < 1
        ) {
          return false;
        }
        const start = isoToUtcMidday(seriesStartIso);
        const selected = isoToUtcMidday(selectedDateIso);
        const msDay = 24 * 60 * 60 * 1000;
        const daysDiff = Math.round(
          (selected.getTime() - start.getTime()) / msDay
        );
        return daysDiff >= 0 && daysDiff % t.repeatIntervalDays === 0;
      }

      if (t.frequency === "once") {
        return selectedDateIso === seriesStartIso;
      }

      return false;
    },
    [selectedDateIso]
  );

  const visibleTasks = useMemo(
    () => sortForList(tasks.filter((t) => tasksForSelectedDate(t))),
    [tasks, tasksForSelectedDate]
  );

  const completedSet = useMemo(() => new Set(completedTaskIds), [completedTaskIds]);

  const taskQueryLower = useMemo(() => taskSearch.trim().toLowerCase(), [taskSearch]);

  const filteredVisibleTasks = useMemo(
    () => visibleTasks.filter((t) => taskMatchesQuery(t, taskQueryLower)),
    [visibleTasks, taskQueryLower]
  );

  const rawIncompleteForDate = useMemo(
    () => visibleTasks.filter((t) => !completedSet.has(t.id)),
    [completedSet, visibleTasks]
  );
  const rawCompletedForDate = useMemo(
    () => visibleTasks.filter((t) => completedSet.has(t.id)),
    [completedSet, visibleTasks]
  );

  const incompleteTasks = useMemo(
    () => filteredVisibleTasks.filter((t) => !completedSet.has(t.id)),
    [completedSet, filteredVisibleTasks]
  );
  const completedTasks = useMemo(
    () => filteredVisibleTasks.filter((t) => completedSet.has(t.id)),
    [completedSet, filteredVisibleTasks]
  );

  const pageSize = 10;
  const [incompletePage, setIncompletePage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);

  useEffect(() => {
    setIncompletePage(1);
    setCompletedPage(1);
  }, [selectedDateIso, taskQueryLower]);

  const incompleteStart = (incompletePage - 1) * pageSize;
  const completedStart = (completedPage - 1) * pageSize;
  const incompletePageTasks = incompleteTasks.slice(
    incompleteStart,
    incompleteStart + pageSize
  );
  const completedPageTasks = completedTasks.slice(
    completedStart,
    completedStart + pageSize
  );

  async function toggleFollowup(clientId: string, checked: boolean) {
    await setClientCompletionForDate(clientId, selectedDateIso, checked);
  }

  if (!user) return null;

  return (
    <div className="dashboard-page">
      <header className="dashboard-head">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Tasks and client follow-up for the selected date.
          </p>
        </div>
        <div className="dashboard-controls">
          <input
            className="date-picker"
            type="date"
            value={selectedDateIso}
            onChange={(e) => setSelectedDateIso(e.target.value)}
            aria-label="Select dashboard date"
          />
        </div>
      </header>

      {error ? (
        <div className="banner-error" role="alert">
          <span className="banner-text">{error}</span>
        </div>
      ) : null}
      {followupError ? (
        <div className="banner-error" role="alert">
          <span className="banner-text">{followupError}</span>
        </div>
      ) : null}

      <section className="dashboard-block" aria-labelledby="dash-tasks-heading">
        <h2 id="dash-tasks-heading" className="dashboard-block-title">
          Tasks
        </h2>
        <div className="dashboard-metrics">
          <div className="metric-card total">
            <div className="metric-label">Total</div>
            <div className="metric-value">{filteredVisibleTasks.length}</div>
          </div>
          <div className="metric-card good">
            <div className="metric-label">Done</div>
            <div className="metric-value">{completedTasks.length}</div>
          </div>
          <div className="metric-card warn">
            <div className="metric-label">Pending</div>
            <div className="metric-value">{incompleteTasks.length}</div>
          </div>
        </div>

        {/* <div className="dashboard-task-search">
          <label className="dashboard-task-search-label" htmlFor="dashboard-task-search-input">
            Search tasks
          </label>
          <input
            id="dashboard-task-search-input"
            className="dashboard-task-search-input"
            type="search"
            placeholder="Search by title, category, frequency…"
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div> */}
      </section>

      <section className="dashboard-lists">
        <article className="panel dashboard-list">
          <div className="dashboard-list-head">
            <h2>Pending tasks</h2>
            <span className="dashboard-count">{incompleteTasks.length}</span>
          </div>

          {loading ? <p className="empty-row">Loading…</p> : null}
          {!loading && incompleteTasks.length === 0 ? (
            <p className="empty-row">
              {rawIncompleteForDate.length === 0
                ? "No incomplete tasks for this date."
                : "No pending tasks match your search."}
            </p>
          ) : null}

          {incompleteTasks.length > 0 ? (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>✓</th>
                    <th>Task</th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {incompletePageTasks.map((t, idx) => (
                    <tr key={t.id}>
                      <td>{incompleteStart + idx + 1}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={(e) =>
                            void setTaskCompletionForDate(
                              t.id,
                              selectedDateIso,
                              e.target.checked
                            )
                          }
                        />
                      </td>
                      <td>{t.title}</td>
                      <td>{displayDate(selectedDateIso)}</td>
                      <td>{t.category ?? "-"}</td>
                      <td className="dash-freq">{t.frequency.toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <Pagination
            totalItems={incompleteTasks.length}
            pageSize={pageSize}
            currentPage={incompletePage}
            onPageChange={setIncompletePage}
          />
        </article>

        <article className="panel dashboard-list">
          <div className="dashboard-list-head">
            <h2>Done tasks</h2>
            <span className="dashboard-count">{completedTasks.length}</span>
          </div>

          {loading ? <p className="empty-row">Loading…</p> : null}
          {!loading && completedTasks.length === 0 ? (
            <p className="empty-row">
              {rawCompletedForDate.length === 0
                ? "No completed tasks for this date."
                : "No done tasks match your search."}
            </p>
          ) : null}

          {completedTasks.length > 0 ? (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>✓</th>
                    <th>Task</th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {completedPageTasks.map((t, idx) => (
                    <tr key={t.id} className="done">
                      <td>{completedStart + idx + 1}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={(e) =>
                            void setTaskCompletionForDate(
                              t.id,
                              selectedDateIso,
                              e.target.checked
                            )
                          }
                        />
                      </td>
                      <td>{t.title}</td>
                      <td>{displayDate(selectedDateIso)}</td>
                      <td>{t.category ?? "-"}</td>
                      <td className="dash-freq">{t.frequency.toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <Pagination
            totalItems={completedTasks.length}
            pageSize={pageSize}
            currentPage={completedPage}
            onPageChange={setCompletedPage}
          />
        </article>
      </section>

      <section
        className="dashboard-block dashboard-followup-block"
        aria-labelledby="dash-followup-heading"
      >
        <h2 id="dash-followup-heading" className="dashboard-block-title">
          Client follow-up
        </h2>
        <p className="dashboard-block-hint">
          client follow-up details for{" "}
          <strong>{displayDate(selectedDateIso)}</strong>.
        </p>

        <div className="dashboard-metrics dashboard-metrics-followup">
          <div className="metric-card total">
            <div className="metric-label">Clients</div>
            <div className="metric-value">{followupClients.length}</div>
          </div>
          <div className="metric-card good">
            <div className="metric-label">Done</div>
            <div className="metric-value">{followupCompletedCount}</div>
          </div>
          <div className="metric-card warn">
            <div className="metric-label">Pending</div>
            <div className="metric-value">{followupPendingCount}</div>
          </div>
        </div>

        {followupLoading ? (
          <p className="empty-row dashboard-followup-loading">Loading follow-ups…</p>
        ) : null}
        {!followupLoading && followupClients.length === 0 ? (
          <p className="empty-row">
            No follow-up clients yet. Add them on{" "}
            <Link to="/followup-clients">Client Followup</Link>.
          </p>
        ) : null}

        {!followupLoading && followupClients.length > 0 ? (
          <section className="panel dashboard-followup-panel">
            <h3 className="dashboard-followup-panel-title">By track</h3>
            <div className="dashboard-tracker-grid">
              {VPDM_TRACKS.map((track) => {
                const rows = (followupGrouped.get(track) ?? [])
                  .slice()
                  .sort((a, b) => a.clientName.localeCompare(b.clientName))
                  .map((r) => ({
                    id: r.id,
                    client: r.clientName,
                    owner: r.owner ?? "",
                  }));
                return (
                  <article key={track} className="dashboard-tracker-card">
                    <h4>{track}</h4>
                    <ul>
                      {rows.length === 0 ? (
                        <li className="dashboard-tracker-empty">No clients</li>
                      ) : (
                        rows.map((entry) => {
                          const checked = completedClientIds.includes(entry.id);
                          return (
                            <li key={`${track}-${entry.id}`}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    void toggleFollowup(entry.id, e.target.checked)
                                  }
                                />
                                <span>{entry.client}</span>
                                {entry.owner ? (
                                  <em>({entry.owner})</em>
                                ) : (
                                  <em className="dashboard-tracker-no-owner">—</em>
                                )}
                              </label>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}
