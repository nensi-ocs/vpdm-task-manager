import { useMemo } from "react";
import "./Pagination.css";

type Props = {
  totalItems: number;
  pageSize: number;
  currentPage: number; // 1-based
  onPageChange: (page: number) => void;
};

function rangePages(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

export function Pagination({
  totalItems,
  pageSize,
  currentPage,
  onPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const pages = useMemo(() => {
    if (totalPages <= 7) return rangePages(1, totalPages);

    const set = new Set<number>();
    set.add(1);
    set.add(totalPages);
    set.add(currentPage);
    set.add(currentPage - 1);
    set.add(currentPage + 1);

    const list = [...set]
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);

    const withEllipses: Array<number | "…"> = [];
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i]!;
      const prev = list[i - 1];
      if (prev !== undefined && p - prev > 1) {
        withEllipses.push("…");
      }
      withEllipses.push(p);
    }
    return withEllipses;
  }, [currentPage, totalPages]);

  if (totalItems <= pageSize) return null;

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
      >
        Prev
      </button>

      <div className="pagination-pages">
        {pages.map((p, idx) => {
          if (p === "…") {
            return (
              <span key={`e-${idx}`} className="pagination-ellipsis">
                …
              </span>
            );
          }
          return (
            <button
              key={p}
              type="button"
              className={`btn ghost sm pagination-btn ${
                p === currentPage ? "active" : ""
              }`}
              onClick={() => onPageChange(p)}
              aria-current={p === currentPage ? "page" : undefined}
            >
              {p}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn ghost sm"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage >= totalPages}
      >
        Next
      </button>
    </div>
  );
}

