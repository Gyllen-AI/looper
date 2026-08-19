import { BASELINE_HEADER } from "../stubs.ts";
import { countIn } from "../present.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeAtomically } from "../atomic.ts";
import {
  BASELINE_PATH,
} from "../config.ts";
import { parseToml, tableIn } from "../toml.ts";
import type { Violation } from "./rule.ts";

export type Counts = ReadonlyMap<string, number>;

export type Baseline = ReadonlyMap<string, Counts>;

export const NOTHING_FORGIVEN: Baseline = new Map();

export function readBaseline(root: string): Baseline {
  const path = join(root, BASELINE_PATH);
  if (!existsSync(path)) return NOTHING_FORGIVEN;

  const document = parseToml(readFileSync(path, "utf8"), BASELINE_PATH);
  const baseline = new Map<string, Counts>();
  for (const [file] of document) {
    if (file.length === 0) continue;
    const counts = new Map<string, number>();
    for (const [ruleId, held] of tableIn(document, file)) {
      if (typeof held === "number") counts.set(ruleId, held);
    }
    baseline.set(file, counts);
  }
  return baseline;
}

export function countsOf(violations: readonly Violation[]): Baseline {
  const counted = new Map<string, Map<string, number>>();
  for (const violation of violations) {
    const forFile = counted.get(violation.file);
    const held = forFile === undefined ? new Map<string, number>() : forFile;
    held.set(violation.rule.id, countIn(held, violation.rule.id) + 1);
    counted.set(violation.file, held);
  }
  return counted;
}

export function totalIn(baseline: Baseline): number {
  let total = 0;
  for (const [, counts] of baseline) {
    for (const [, held] of counts) total += held;
  }
  return total;
}

export function isRecorded(baseline: Baseline, file: string, ruleId: string): boolean {
  const counts = baseline.get(file);
  if (counts === undefined) return false;
  const held = counts.get(ruleId);
  return held !== undefined && held > 0;
}

export type Carried = {
  readonly yours: readonly Violation[];
  readonly older: readonly Violation[];
};

export function againstBaseline(
  baseline: Baseline,
  violations: readonly Violation[],
): Carried {
  const yours: Violation[] = [];
  const older: Violation[] = [];
  for (const violation of violations) {
    if (isRecorded(baseline, violation.file, violation.rule.id)) older.push(violation);
    else yours.push(violation);
  }
  return { yours, older };
}

export function render(baseline: Baseline): string {
  const lines = [BASELINE_HEADER];
  for (const file of [...baseline.keys()].sort()) {
    const counts = baseline.get(file);
    if (counts === undefined) continue;
    lines.push(``, `["${file}"]`);
    for (const ruleId of [...counts.keys()].sort()) {
      lines.push(`"${ruleId}" = ${counts.get(ruleId)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function writeBaseline(root: string, baseline: Baseline): void {
  writeAtomically(join(root, BASELINE_PATH), render(baseline));
}

export type Shrink =
  | { readonly kind: "unchanged" }
  | { readonly kind: "shrunk"; readonly baseline: Baseline; readonly by: number };

export function shrinkToward(recorded: Baseline, current: Baseline): Shrink {
  const next = new Map<string, Counts>();
  let removed = 0;

  for (const [file, counts] of recorded) {
    const nowInFile = current.get(file);
    const kept = new Map<string, number>();
    for (const [ruleId, was] of counts) {
      const now = nowInFile === undefined ? 0 : countIn(nowInFile, ruleId);
      const lower = Math.min(was, now);
      removed += was - lower;
      if (lower > 0) kept.set(ruleId, lower);
    }
    if (kept.size > 0) next.set(file, kept);
  }

  if (removed === 0) return { kind: "unchanged" };
  return { kind: "shrunk", baseline: next, by: removed };
}
