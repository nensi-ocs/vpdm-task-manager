/** Text size for the whole app. Every size in the CSS is in rem, so changing the root size scales everything. */

export const MIN_TEXT_SIZE = 12;
export const MAX_TEXT_SIZE = 28;
/** Matches the root font-size in index.css. */
export const DEFAULT_TEXT_SIZE = 19;

const STORAGE_KEY = "text-size";

export function clampTextSize(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_TEXT_SIZE;
  return Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, Math.round(px)));
}

export function loadTextSize(): number {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved >= MIN_TEXT_SIZE && saved <= MAX_TEXT_SIZE) return clampTextSize(saved);
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_TEXT_SIZE;
}

export function applyTextSize(px: number) {
  document.documentElement.style.fontSize = `${clampTextSize(px)}px`;
}

export function saveTextSize(px: number) {
  const size = clampTextSize(px);
  applyTextSize(size);
  try {
    localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // The size still applies until the page is reloaded.
  }
}
