import { RUST_RULES } from "../src/law/rust/rules.ts";
import { CROSSED_BOUNDARY } from "../src/law/rust/boundary.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { knownRuleIds } from "../src/law/checks.ts";
import { required } from "../src/present.ts";

const NOT_BUILT = "not built yet";

const ROW = /^\|\s*`([A-Z]+(?:-[A-Z]+)?:\d+)`\s*\|(.*)\|(.*)\|\s*$/;

type Row = { readonly id: string; readonly disposition: string };

function tableRows(): readonly Row[] {
  const plan = readFileSync("docs/PLAN.md", "utf8");
  const found: Row[] = [];
  for (const line of plan.split("\n")) {
    const held = ROW.exec(line);
    if (held === null) continue;
    found.push({
      id: required(held[1], "the rule id in a table row"),
      disposition: required(held[3], "the disposition in a table row"),
    });
  }
  return found;
}

test("a rule the plan names is built, or the plan says it is not", () => {
  const built = new Set(knownRuleIds());
  const lying: string[] = [];
  for (const row of tableRows()) {
    if (built.has(row.id)) continue;
    if (row.disposition.toLowerCase().includes(NOT_BUILT)) continue;
    lying.push(row.id);
  }
  assert.deepEqual(
    lying,
    [],
    `the plan describes these as in force and they do not exist. Build them, or write "${NOT_BUILT}" in their row.`,
  );
});

test("a rule that exists is named in the plan", () => {
  const plan = readFileSync("docs/PLAN.md", "utf8");
  const unrecorded = knownRuleIds().filter((id) => !plan.includes(id));
  assert.deepEqual(unrecorded, [], "these rules are enforced and the design record does not mention them");
});

const TOOLS: readonly string[] = [
  "Hono",
  "Drizzle",
  "PostgreSQL",
  "Pino",
  "OpenTelemetry",
  "Vitest",
  "Playwright",
  "Turborepo",
  "Biome",
  "Expo",
  "Axum",
  "Tokio",
  "SQLx",
  "thiserror",
  "secrecy",
  "reqwest",
  "FastAPI",
  "Pydantic",
  "Uvicorn",
  "SQLAlchemy",
  "Alembic",
  "structlog",
  "pytest",
  "Ruff",
  "mypy",
];

function namesAList(line: string): boolean {
  return TOOLS.filter((tool) => line.includes(tool)).length >= 3;
}

test("the list of tools lives in STACK.md, and the plan argues rather than lists", () => {
  const stack = readFileSync("STACK.md", "utf8");
  const missing = TOOLS.filter((tool) => !stack.includes(tool));
  assert.deepEqual(missing, [], "STACK.md is the list, so every tool belongs in it");

  const listing = readFileSync("docs/PLAN.md", "utf8").split("\n").filter(namesAList);
  assert.deepEqual(
    listing,
    [],
    "naming three tools on one line is a second copy of the list, and a second thing to keep true. PLAN.md argues the choices one at a time; STACK.md states them.",
  );
});

function wordsIn(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[`*|]/g, " ")
    .split(/[^a-z0-9_:!]+/)
    .filter((word) => word.length > 4);
}

test("a row about a rule describes the rule it names", () => {
  const plan = readFileSync("docs/PLAN.md", "utf8");
  const rows = [...plan.matchAll(/^\| `(RUST-[A-Z]+:\d+|TAURI:\d+)` \| ([^|]+) \|/gm)];
  const built = new Map(RUST_RULES.map((held) => [held.id, held.bans]));
  built.set(CROSSED_BOUNDARY.id, CROSSED_BOUNDARY.bans);

  const lying: string[] = [];
  for (const [, id, says] of rows) {
    const real = built.get(required(id, "a rule id in the table"));
    if (real === undefined) continue;
    if (says.toLowerCase().includes("not built yet")) continue;

    const asked = wordsIn(required(says, "what the row says"));
    const shared = asked.filter((word) => real.toLowerCase().includes(word)).length;
    if (asked.length > 0 && shared < Math.max(1, asked.length * 0.3)) {
      lying.push(`${id}: the row says "${says.trim().slice(0, 50)}…"`);
    }
  }

  assert.deepEqual(
    lying,
    [],
    "a row in the plan describes a rule other than the one it names. That happened once for a day, and two of the rows promised rules that do not exist.",
  );
});
