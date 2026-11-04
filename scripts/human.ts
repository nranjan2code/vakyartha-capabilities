// Version changes and release signing are human acts. They run only at an
// interactive terminal, never under CI or another program, and only after the
// person types the exact version again.
import { createInterface } from "node:readline/promises";

export async function confirmVersion(action: string, version: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) throw new Error(`${action} needs a person at an interactive terminal; it never runs automatically.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = (await rl.question(`${action} ${version}. Type the version again to confirm: `)).trim();
    if (typed !== version) throw new Error("The versions do not match; nothing was changed.");
  } finally { rl.close(); }
}

/** Asks the person to type a new version for one item; the suggestion is shown, never applied. */
export async function typeItemVersion(label: string, current: string, suggested: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) throw new Error(`${label} needs a person at an interactive terminal; it never runs automatically.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = (await rl.question(`${label} changed since the last release (now ${current}; suggested ${suggested}). Type its new version: `)).trim();
    const parts = (v: string) => v.split(".").map(Number);
    const higher = (a: number[], b: number[]) => a[0]! !== b[0]! ? a[0]! > b[0]! : a[1]! !== b[1]! ? a[1]! > b[1]! : a[2]! > b[2]!;
    if (!/^\d+\.\d+\.\d+$/.test(typed) || !higher(parts(typed), parts(current))) throw new Error(`${label}: type an exact version above ${current}; nothing was changed.`);
    return typed;
  } finally { rl.close(); }
}
