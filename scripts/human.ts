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
