import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_SECTION, parseToml, tableIn } from "../toml.ts";

export type Reach = "internal" | "external";

export type Check = {
  readonly label: string;
  readonly reach: Reach;
  readonly run: string;
};

export type Declared = {
  readonly checks: readonly Check[];
  readonly complaints: readonly string[];
};

export const LOOP_FILE = ".looper/loop.toml";

const NOTHING: readonly Check[] = [];

function reachOf(raw: string | undefined, label: string): Reach | string {
  if (raw === "internal") return "internal";
  if (raw === "external") return "external";
  if (raw === undefined) return `${label}: no reach, say internal or external`;
  return `${label}: reach is "${raw}", say internal or external`;
}

function oneString(table: ReadonlyMap<string, unknown>, key: string): string | undefined {
  const held = table.get(key);
  if (typeof held === "string") return held;
  return undefined;
}

export function declaredIn(root: string): Declared {
  let source: string;
  try {
    source = readFileSync(join(root, LOOP_FILE), "utf8");
  } catch {
    return { checks: NOTHING, complaints: [] };
  }
  const document = parseToml(source, LOOP_FILE);
  const checks: Check[] = [];
  const complaints: string[] = [];
  for (const label of document.keys()) {
    if (label === ROOT_SECTION) continue;
    const table = tableIn(document, label);
    const reach = reachOf(oneString(table, "reach"), label);
    const run = oneString(table, "run");
    if (run === undefined) {
      complaints.push(`${label}: no run, so there is nothing to ask`);
      continue;
    }
    if (reach !== "internal" && reach !== "external") {
      complaints.push(reach);
      continue;
    }
    checks.push({ label, reach, run });
  }
  return { checks, complaints };
}
