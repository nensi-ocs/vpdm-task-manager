import { useCallback, useState, type DragEvent } from "react";
import "./sortable-list.css";

type DropOptions = {
  group?: string;
  groupIds: string[];
  axis?: "x" | "y";
  onMoveToGroup?: (id: string, group: string) => void;
};

export type SortableList = ReturnType<typeof useSortableList>;

function loadOrder(storageKey: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function saveOrder(storageKey: string, order: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // The order still applies until the page is reloaded.
  }
}

/** Drag-to-reorder for a list, with the order saved per user in this browser. */
export function useSortableList(listKey: string, userId: string | undefined) {
  const storageKey = `sortable-order:${userId ?? "anon"}:${listKey}`;
  const [order, setOrder] = useState<string[]>(() => loadOrder(storageKey));
  const [dragged, setDragged] = useState<{ id: string; group?: string } | null>(null);
  const [target, setTarget] = useState<{ id: string; after: boolean } | null>(null);

  const sort = useCallback(
    <T,>(items: readonly T[], getId: (item: T) => string): T[] => {
      const position = (id: string) => {
        const i = order.indexOf(id);
        return i === -1 ? order.length : i;
      };
      return [...items].sort((a, b) => position(getId(a)) - position(getId(b)));
    },
    [order]
  );

  function clearDrag() {
    setDragged(null);
    setTarget(null);
  }

  function drop({ group, groupIds, onMoveToGroup }: DropOptions) {
    if (!dragged) return;
    const ids = groupIds.filter((id) => id !== dragged.id);
    const targetIndex = target ? ids.indexOf(target.id) : -1;
    ids.splice(targetIndex === -1 ? ids.length : targetIndex + (target?.after ? 1 : 0), 0, dragged.id);
    const next = [...order.filter((id) => !ids.includes(id)), ...ids];
    setOrder(next);
    saveOrder(storageKey, next);
    if (dragged.group !== group) onMoveToGroup?.(dragged.id, group ?? "");
    clearDrag();
  }

  function accepts(group: string | undefined, onMoveToGroup: DropOptions["onMoveToGroup"]) {
    return dragged != null && (dragged.group === group || onMoveToGroup != null);
  }

  function itemProps(id: string, options: DropOptions) {
    const { group, axis = "y", onMoveToGroup } = options;
    return {
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        setDragged({ id, group });
      },
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts(group, onMoveToGroup)) return;
        e.preventDefault();
        e.stopPropagation();
        if (dragged?.id === id) {
          setTarget(null);
          return;
        }
        const box = e.currentTarget.getBoundingClientRect();
        const after =
          axis === "x"
            ? e.clientX > box.left + box.width / 2
            : e.clientY > box.top + box.height / 2;
        setTarget({ id, after });
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!accepts(group, onMoveToGroup)) return;
        e.preventDefault();
        e.stopPropagation();
        drop(options);
      },
      onDragEnd: clearDrag,
    };
  }

  /** Drop zone for gaps and empty groups; the item lands at the end. */
  function containerProps(options: DropOptions) {
    return {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts(options.group, options.onMoveToGroup)) return;
        e.preventDefault();
        setTarget(null);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!accepts(options.group, options.onMoveToGroup)) return;
        e.preventDefault();
        e.stopPropagation();
        drop(options);
      },
    };
  }

  function dragClass(id: string, axis: "x" | "y" = "y") {
    const classes = ["sortable-item"];
    if (dragged?.id === id) classes.push("sortable-dragging");
    if (target?.id === id) {
      classes.push(`sortable-drop-${target.after ? "after" : "before"}-${axis}`);
    }
    return classes.join(" ");
  }

  return { sort, itemProps, containerProps, dragClass };
}
