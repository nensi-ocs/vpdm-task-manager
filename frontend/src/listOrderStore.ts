import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiGet, apiSendJson } from "./api";
import { toastApiError } from "./toast";

/**
 * Drag-and-drop list orders, saved per user on the server so they survive
 * logout, other browsers and other devices. localStorage is only a cache that
 * avoids a flash of the default order while the server copy loads.
 */

const EMPTY: string[] = [];
const cache = new Map<string, string[]>();
const listeners = new Set<() => void>();
/** Lists changed here since page load; a late server response must not undo them. */
const changedHere = new Set<string>();
/** Per user: list keys the server has an order for (set once loaded). */
const serverKeys = new Map<string, Set<string>>();
const loading = new Map<string, Promise<void>>();
let saveQueue: Promise<void> = Promise.resolve();

const cacheKey = (userId: string, listKey: string) => `${userId}:${listKey}`;
const storageKey = (userId: string, listKey: string) => `sortable-order:${userId}:${listKey}`;

function readStorage(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function writeStorage(key: string, order: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(order));
  } catch {
    // The server copy is the one that matters.
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(userId: string | undefined, listKey: string, legacyStorageKey?: string): string[] {
  if (!userId) return EMPTY;
  const key = cacheKey(userId, listKey);
  let order = cache.get(key);
  if (!order) {
    order = readStorage(storageKey(userId, listKey));
    if (order.length === 0 && legacyStorageKey) order = readStorage(legacyStorageKey);
    if (order.length === 0) order = EMPTY;
    cache.set(key, order);
  }
  return order;
}

function push(userId: string, listKey: string, itemIds: string[]) {
  saveQueue = saveQueue.then(async () => {
    try {
      await apiSendJson(`/list-orders/${encodeURIComponent(listKey)}`, "PUT", { itemIds });
      serverKeys.get(userId)?.add(listKey);
    } catch (err) {
      toastApiError(err, "Failed to save the new order");
    }
  });
}

/** Uploads an order that so far only exists in this browser (saved before server sync existed). */
function uploadIfOnlyLocal(userId: string, listKey: string) {
  const known = serverKeys.get(userId);
  if (!known || known.has(listKey)) return;
  const order = cache.get(cacheKey(userId, listKey));
  if (!order || order.length === 0) return;
  known.add(listKey);
  push(userId, listKey, order);
}

function loadFromServer(userId: string) {
  if (loading.has(userId)) return;
  const request = apiGet<Record<string, string[]>>("/list-orders")
    .then((saved) => {
      for (const [listKey, itemIds] of Object.entries(saved)) {
        const key = cacheKey(userId, listKey);
        if (changedHere.has(key)) continue;
        cache.set(key, itemIds);
        writeStorage(storageKey(userId, listKey), itemIds);
      }
      serverKeys.set(userId, new Set(Object.keys(saved)));
      const prefix = `${userId}:`;
      for (const key of cache.keys()) {
        if (key.startsWith(prefix)) uploadIfOnlyLocal(userId, key.slice(prefix.length));
      }
      emit();
    })
    .catch(() => {
      // Keep showing the cached order; retry on the next page that needs it.
      loading.delete(userId);
    });
  loading.set(userId, request);
}

/** Forget loaded orders so the next login fetches fresh ones from the server. */
export function resetListOrders() {
  cache.clear();
  changedHere.clear();
  serverKeys.clear();
  loading.clear();
  emit();
}

/**
 * The saved order (item ids) of one list for the signed-in user, plus a setter
 * that saves it. `legacyStorageKey` is an older browser-only key to migrate from.
 */
export function useListOrder(
  listKey: string,
  userId: string | undefined,
  legacyStorageKey?: string
): [string[], (next: string[]) => void] {
  const order = useSyncExternalStore(subscribe, () => read(userId, listKey, legacyStorageKey));

  useEffect(() => {
    if (!userId) return;
    loadFromServer(userId);
    uploadIfOnlyLocal(userId, listKey);
  }, [userId, listKey, order]);

  const setOrder = useCallback(
    (next: string[]) => {
      if (!userId) return;
      const key = cacheKey(userId, listKey);
      cache.set(key, next);
      changedHere.add(key);
      writeStorage(storageKey(userId, listKey), next);
      emit();
      push(userId, listKey, next);
    },
    [userId, listKey]
  );

  return [order, setOrder];
}
