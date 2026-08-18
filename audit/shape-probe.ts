import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { SKELETON_WORDS, render, shapeFor, type Shape } from "../src/report/skeleton.ts";
import { leaksInShape } from "../src/report/write.ts";
import { REPORT_DEPTH } from "../src/config.ts";

const LOOPER_ROOT = join(import.meta.dirname, "..");

const CORPUS = process.argv[2];

if (CORPUS === undefined) {
  console.log("usage: node audit/shape-probe.ts <a directory of code nobody here wrote>");
  process.exit(2);
}

function filesUnder(at: string, endings: readonly string[], cap: number): readonly string[] {
  const found: string[] = [];
  const pending: string[] = [at];
  while (pending.length > 0 && found.length < cap) {
    const here = pending.pop();
    if (here === undefined) continue;
    let entries: readonly string[] = [];
    try {
      entries = readdirSync(here);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(here, entry);
      let held;
      try {
        held = statSync(path);
      } catch {
        continue;
      }
      if (held.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (endings.some((ending) => path.endsWith(ending))) found.push(path);
      if (found.length >= cap) break;
    }
  }
  return found;
}

const A_GIVEN_NAME = /^name[0-9]+$/;
const PUNCTUATION = /^[^A-Za-z0-9_]$/;
const A_NODE_KIND = /^[A-Z][A-Za-z0-9]*$/;

const SAYABLE_DETAIL: ReadonlySet<string> = new Set([
  ...SKELETON_WORDS,
  "value-removed",
]);

function detailLeaks(shape: Shape, at: string, into: string[]): void {
  for (const one of shape.detail) {
    if (A_GIVEN_NAME.test(one)) continue;
    if (PUNCTUATION.test(one)) continue;
    if (SAYABLE_DETAIL.has(one)) continue;
    if (A_NODE_KIND.test(one)) continue;
    into.push(`${at} — detail "${one}"`);
  }
  for (const child of shape.children) detailLeaks(child, at, into);
}

let asked = 0;
let shaped = 0;
let refused = 0;
const leaked: string[] = [];

for (const path of filesUnder(CORPUS, [".rs", ".py", ".ts"], 400)) {
  let source = "";
  try {
    source = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  const lines = source.split("\n");
  for (const at of [3, 11, 23, 47, 91]) {
    if (at > lines.length) continue;
    asked += 1;
    const located = shapeFor(LOOPER_ROOT, path, source, at, REPORT_DEPTH);
    if (located.kind === "not-found") {
      refused += 1;
      continue;
    }
    shaped += 1;
    for (const leak of leaksInShape(render(located.shape, 0))) {
      leaked.push(`${path}:${at} — ${leak.word}`);
    }
    detailLeaks(located.shape, `${path}:${at}`, leaked);
  }
}

console.log(`${asked} lines asked about, ${shaped} shaped, ${refused} refused with a reason`);
console.log(`${leaked.length} leaks`);
for (const one of leaked.slice(0, 20)) console.log(`  ${one}`);
if (leaked.length > 0) process.exit(1);
