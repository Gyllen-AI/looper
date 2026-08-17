import { required } from "../src/present.ts";
import { execFileSync } from "node:child_process";

import { CONCEDING_NOTHING, type Concessions } from "../src/law/concessions.ts";
import { judge, type Check } from "../src/law/engine.ts";

const ANY_FILE = "src/a.ts";

export function countWhere(
  check: Check,
  text: string,
  file: string,
  concessions: Concessions,
): number {
  return judge([check], "fast", { file, text }, concessions).violations.length;
}

export function countIn(check: Check, text: string): number {
  return countWhere(check, text, ANY_FILE, CONCEDING_NOTHING);
}

export function gitIn(root: string, ...args: readonly string[]): void {
  execFileSync("git", [...args], { cwd: root, stdio: "ignore" });
}

export function first<T>(items: readonly T[]): T {
  return required(items[0], "the first of them, and there were none");
}
