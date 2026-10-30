/**
 * Task keys ("ROS-12") in commit messages and pull request titles. Pure, so
 * it can be tested on its own.
 */

const KEY = "[A-Za-z][A-Za-z0-9]{1,9}-\\d{1,6}";

/** Words that say a commit finishes a task: "fixes ROS-12", "closes ROS-3, ROS-4". */
const CLOSING = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\b[\\s:]+((?:#?${KEY}(?:\\s*(?:,|and|&)\\s*)?)+)`, "gi");

/** Every key in the text, upper case, in order, once each; and the ones it says it closes. */
export function keysIn(text: string): { keys: string[]; closes: string[] } {
  const keys = [...new Set([...text.matchAll(new RegExp(`\\b(${KEY})\\b`, "g"))].map((m) => m[1].toUpperCase()))];
  const closes = new Set<string>();
  for (const m of text.matchAll(CLOSING)) {
    for (const k of m[1].matchAll(new RegExp(KEY, "g"))) closes.add(k[0].toUpperCase());
  }
  return { keys, closes: keys.filter((k) => closes.has(k)) };
}

/** 2 to 6 capitals or digits, starting with a letter: "ROS", "PAY2". */
export const PREFIX = /^[A-Z][A-Z0-9]{1,5}$/;

/** A workspace's first prefix, from its name: "Rosetta" → "ROS", "Data Jugaad" → "DJ". */
export function defaultPrefix(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  const initials = words.map((w) => w[0]).join("");
  const prefix = words.length > 1 ? initials.slice(0, 4) : (words[0] ?? "").slice(0, 3);
  return PREFIX.test(prefix) ? prefix : "TSK";
}

/** "ros-12" → "ROS-12", or null when it isn't a key. */
export function normalizeKey(raw: string) {
  const k = raw.trim().toUpperCase();
  return new RegExp(`^${KEY}$`).test(k) ? k : null;
}
