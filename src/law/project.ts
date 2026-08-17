import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { JUDGED_EXTENSIONS, OUTSIDE_THE_LAW, RUST_EXTENSION } from "../config.ts";
import { trackedFiles } from "../git.ts";
import { readConcessions } from "./concessions.ts";
import { judge } from "./engine.ts";
import { CHECKS } from "./checks.ts";
import { checksAdoptedIn } from "./adopted.ts";
import type { Violation } from "./rule.ts";
import { reasonFrom } from "../fields.ts";
import { required } from "../present.ts";
import { commandsUnder, judgeRust } from "./rust/drive.ts";
import { crossingsIn } from "./rust/boundary.ts";
import { roleOf, shapeOf, type Shape } from "./shape.ts";
import { rustRuleFor } from "./rust/rules.ts";

export type Survey = {
  readonly violations: readonly Violation[];
  readonly files: number;
  readonly unreadable: readonly string[];
};

export function judgedFiles(root: string): readonly string[] {
  const found: string[] = [];

  function walkDirectory(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (OUTSIDE_THE_LAW.includes(entry)) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walkDirectory(path);
        continue;
      }
      if (JUDGED_EXTENSIONS.some((suffix) => entry.endsWith(suffix))) found.push(path);
    }
  }

  walkDirectory(root);
  return found;
}

export type Reach = "everything" | "already-tracked";

function reached(root: string, reach: Reach): readonly string[] {
  const everything = judgedFiles(root);
  if (reach === "everything") return everything;

  const tracked = trackedFiles(root);
  if (tracked.kind === "unavailable") return everything;
  const known = new Set(tracked.paths.map((path) => join(root, path)));
  return everything.filter((path) => known.has(path));
}

export type RustSaid = { readonly violations: readonly Violation[]; readonly unreadable: readonly string[] };

function looperRoot(): string {
  return join(import.meta.dirname, "..", "..");
}

type Answering =
  | { readonly kind: "none" }
  | { readonly kind: "named"; readonly names: ReadonlySet<string> };

function commandsAnswering(root: string, shape: Shape): Answering {
  if (shape.kind !== "tauri") return { kind: "none" };

  const names = new Set<string>();
  let read = false;
  for (const where of shape.rustUnder) {
    const said = commandsUnder(looperRoot(), join(root, where));
    if (said.kind !== "named") continue;
    read = true;
    for (const name of said.names) names.add(name);
  }
  return read ? { kind: "named", names } : { kind: "none" };
}

function crateRootFor(file: string, stopAt: string): string {
  let at = dirname(file);
  for (;;) {
    if (existsSync(join(at, "Cargo.toml"))) return at;
    const up = dirname(at);
    if (up === at || at.length <= stopAt.length) return stopAt;
    at = up;
  }
}

function byCrate(root: string, files: readonly string[]): ReadonlyMap<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const file of files) {
    const crate = crateRootFor(file, root);
    const held = grouped.get(crate);
    if (held === undefined) grouped.set(crate, [file]);
    else held.push(file);
  }
  return grouped;
}

export function judgeRustIn(root: string, files: readonly string[]): RustSaid {
  if (files.length === 0) return { violations: [], unreadable: [] };

  const violations: Violation[] = [];
  const unreadable: string[] = [];
  for (const [crate, inCrate] of byCrate(root, files)) {
    const said = judgedCrate(root, crate, inCrate);
    violations.push(...said.violations);
    unreadable.push(...said.unreadable);
  }
  return { violations, unreadable };
}

function namedAmong(said: string, crate: string, files: readonly string[]): string {
  const guess = join(crate, said);
  if (existsSync(guess)) return guess;
  const ending = `/${said}`;
  const held = files.find((path) => path.endsWith(ending));
  return held === undefined ? guess : held;
}

const ALREADY_SAID = /^could not read /;

function withoutRepeatedOpening(detail: string): string {
  return detail.replace(ALREADY_SAID, "");
}

const COULD_NOT_PARSE = /could not read (\S+) as Rust: [^(]*\(line (\d+)\)/;

function refusedCrate(root: string, detail: string): RustSaid {
  const held = COULD_NOT_PARSE.exec(detail);
  const known = rustRuleFor("ERROR:9");
  if (held === null || known.kind === "unknown") {
    return { violations: [], unreadable: [withoutRepeatedOpening(detail)] };
  }
  const file = required(held[1], "the file the Rust reader named");
  const line = Number(required(held[2], "the line the Rust reader named"));
  return {
    violations: [{ rule: known.rule, file: relative(root, file), line }],
    unreadable: [],
  };
}

function judgedCrate(root: string, crate: string, files: readonly string[]): RustSaid {
  const said = judgeRust(looperRoot(), crate, []);
  if (said.kind !== "found") return refusedCrate(root, said.detail);

  const violations: Violation[] = [];
  const unknown: string[] = [];
  for (const hit of said.hits) {
    const named = namedAmong(hit.file, crate, files);
    const known = rustRuleFor(hit.rule);
    if (known.kind === "unknown") {
      unknown.push(`the Rust half reported ${hit.rule}, which looper has no words for`);
      continue;
    }
    violations.push({ rule: known.rule, file: relative(root, named), line: hit.line });
  }
  return { violations, unreadable: unknown };
}

export function surveyProject(root: string, reach: Reach): Survey {
  const concessions = readConcessions(root);
  const checks = [...CHECKS, ...checksAdoptedIn(root)];
  const violations: Violation[] = [];
  const unreadable: string[] = [];
  const files = reached(root, reach);

  const shape = shapeOf(root);
  const answered = commandsAnswering(root, shape);
  const rustFiles = files.filter((path) => path.endsWith(RUST_EXTENSION));
  const rustSaid = judgeRustIn(root, rustFiles);
  violations.push(...rustSaid.violations);
  unreadable.push(...rustSaid.unreadable);

  for (const path of files) {
    if (path.endsWith(RUST_EXTENSION)) continue;
    const named = relative(root, path);
    let text = "";
    try {
      text = readFileSync(path, "utf8");
    } catch (cause) {
      const detail = reasonFrom(cause);
      unreadable.push(`${named} (${detail})`);
      continue;
    }
    if (answered.kind === "named") {
      violations.push(
        ...crossingsIn(named, text, answered.names).map((held) => ({ ...held, file: named })),
      );
    }
    const subject = { file: path, text };
    violations.push(
      ...judge(checks, "fast", { file: named, text, role: roleOf(shape, named) }, concessions)
        .violations,
      ...judge(checks, "slow", subject, concessions).violations.map((held) => ({
        ...held,
        file: named,
      })),
    );
  }

  return { violations, files: files.length, unreadable };
}
