/**
 * Career persistence.
 *
 * Backend order: window.storage (Claude artifact sandbox) → localStorage
 * (self-hosted, e.g. GitHub Pages) → in-memory (private browsing, file://).
 * The shim exists so the same build runs in all three without edits.
 */

import { STORAGE_KEY } from "./config.js";

const memory = {};
const hasSandboxStorage =
  typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";

async function read(key) {
  if (hasSandboxStorage) {
    try {
      const result = await window.storage.get(key);
      return result ? JSON.parse(result.value) : null;
    } catch { /* fall through to localStorage */ }
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return memory[key] ?? null;
  }
}

async function write(key, value) {
  const serialised = JSON.stringify(value);
  if (hasSandboxStorage) {
    try { await window.storage.set(key, serialised); return; } catch { /* fall through */ }
  }
  try { localStorage.setItem(key, serialised); } catch { memory[key] = value; }
}

/** @returns {{unlocked:number, cleared:object, bestGauntlet:number, matches:object[]}} */
export function emptyCareer() {
  return { unlocked: 1, cleared: {}, bestGauntlet: 0, matches: [] };
}

export async function loadCareer() {
  const saved = await read(STORAGE_KEY);
  return saved ? { ...emptyCareer(), ...saved } : emptyCareer();
}

export async function saveCareer(career) {
  // Cap history so the record cannot grow without bound.
  if (career.matches.length > 40) career.matches = career.matches.slice(-40);
  await write(STORAGE_KEY, career);
}
