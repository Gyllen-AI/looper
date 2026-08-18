import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { withLock, writeAtomically } from "../atomic.ts";
import { required } from "../present.ts";


export const HASH_LENGTH = 12;

export const NOTHING_UNDER_IT = "none";

export const DECISIONS_HEADER = `# Decisions taken with a known cost

Where this project and its own law disagree, on purpose. Append-only.

Most entries are security or legal questions nobody on the team can answer, which
is why they are written down rather than argued. The entry exists so that whoever
can answer one is handed a framed, dated question pointed at the code.

Each entry names the files it rests on and the hash of those files when somebody
last read it, so this document is never trusted to be current: looper recomputes
them and says which entries the code has moved out from under. It never edits the
prose, because what an entry says is a judgement and no tool refreshes a judgement.`;

export const DECISIONS_PATH = ".looper/decisions.md";

export const DECISIONS_TOOL = "decisions";

export const DECISIONS_PRIORITY = 30;

export type Decision = {
  readonly taken: string;
  readonly summary: string;
  readonly kind: string;
  readonly depends: readonly string[];
  readonly checked: string;
  readonly hash: string;
  readonly body: string;
};

export type Standing =
  | { readonly kind: "watched"; readonly decision: Decision }
  | { readonly kind: "moved"; readonly decision: Decision; readonly now: string }
  | { readonly kind: "gone"; readonly decision: Decision; readonly missing: readonly string[] }
  | { readonly kind: "unwatchable"; readonly decision: Decision };

const ENTRY = /^##\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(.*)$/;
const FIELD = /^(kind|depends|checked):\s*(.*)$/;

function listFrom(written: string): readonly string[] {
  if (written === NOTHING_UNDER_IT) return [];
  return written
    .split(",")
    .map((one) => one.trim())
    .filter((one) => one.length > 0);
}

export function parseDecisions(source: string): readonly Decision[] {
  const decisions: Decision[] = [];
  let taken = "";
  let summary = "";
  let kind = "";
  let depends: readonly string[] = [];
  let checked = "";
  let hash = "";
  let body: string[] = [];

  const close = (): void => {
    if (summary.length === 0) return;
    decisions.push({ taken, summary, kind, depends, checked, hash, body: body.join("\n").trim() });
  };

  for (const line of source.split("\n")) {
    const heading = ENTRY.exec(line);
    if (heading !== null) {
      close();
      taken = required(heading[1], "the date on a decision heading");
      summary = required(heading[2], "the summary on a decision heading");
      kind = "";
      depends = [];
      checked = "";
      hash = "";
      body = [];
      continue;
    }
    if (summary.length === 0) continue;
    const field = FIELD.exec(line);
    if (field === null) {
      body.push(line);
      continue;
    }
    const name = required(field[1], "the name of a decision field");
    const written = required(field[2], "the value of a decision field");
    if (name === "kind") kind = written;
    if (name === "depends") depends = listFrom(written);
    if (name === "checked") {
      const parts = written.split(/\s+/);
      checked = required(parts[0], "the date a decision was last read");
      const stamp = parts[1];
      if (stamp !== undefined) hash = stamp;
    }
  }
  close();
  return decisions;
}

export function readDecisions(root: string): readonly Decision[] {
  const path = join(root, DECISIONS_PATH);
  if (!existsSync(path)) return [];
  return parseDecisions(readFileSync(path, "utf8"));
}

export function hashOf(root: string, depends: readonly string[]): string {
  const digest = createHash("sha256");
  for (const one of depends) digest.update(readFileSync(join(root, one)));
  return digest.digest("hex").slice(0, HASH_LENGTH);
}

export function standingOf(root: string, decision: Decision): Standing {
  if (decision.depends.length === 0) return { kind: "unwatchable", decision };
  const missing = decision.depends.filter((one) => !existsSync(join(root, one)));
  if (missing.length > 0) return { kind: "gone", decision, missing };
  const now = hashOf(root, decision.depends);
  if (now !== decision.hash) return { kind: "moved", decision, now };
  return { kind: "watched", decision };
}

export function standings(root: string): readonly Standing[] {
  return readDecisions(root).map((decision) => standingOf(root, decision));
}

export function render(decisions: readonly Decision[]): string {
  const lines = [DECISIONS_HEADER];
  for (const one of decisions) {
    const depends = one.depends.length === 0 ? NOTHING_UNDER_IT : one.depends.join(", ");
    lines.push(
      ``,
      `## ${one.taken} — ${one.summary}`,
      `kind: ${one.kind}`,
      `depends: ${depends}`,
      `checked: ${one.checked}  ${one.hash}`,
      ``,
    );
    if (one.body.length > 0) lines.push(one.body);
  }
  return `${lines.join("\n")}\n`;
}

export type Written =
  | { readonly kind: "added"; readonly total: number }
  | { readonly kind: "replaced"; readonly total: number }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "busy"; readonly why: string };

export type Forgotten =
  | { readonly kind: "gone" }
  | { readonly kind: "not-there" }
  | { readonly kind: "busy"; readonly why: string };

export function record(root: string, decision: Decision): Written {
  const path = join(root, DECISIONS_PATH);
  const missing = decision.depends.filter((one) => !existsSync(join(root, one)));
  if (missing.length > 0) {
    return { kind: "unreadable", why: `it depends on ${missing.join(", ")}, which is not there` };
  }

  let written: Written = { kind: "added", total: 0 };
  const stamped = { ...decision, hash: hashOf(root, decision.depends) };

  const lock = withLock(path, () => {
    const held = readDecisions(root);
    const without = held.filter((one) => one.summary !== decision.summary);
    writeAtomically(path, render([...without, stamped]));
    written = {
      kind: without.length !== held.length ? "replaced" : "added",
      total: without.length + 1,
    };
  });

  if (lock.kind === "busy") return { kind: "busy", why: lock.why };
  return written;
}

export function reread(root: string, summary: string, today: string): Forgotten {
  const path = join(root, DECISIONS_PATH);
  let found = false;

  const lock = withLock(path, () => {
    const held = readDecisions(root);
    const wanted = held.filter((one) => one.summary === summary);
    if (wanted.length === 0) return;
    found = true;
    writeAtomically(
      path,
      render(
        held.map((one) =>
          one.summary === summary
            ? { ...one, checked: today, hash: hashOf(root, one.depends) }
            : one,
        ),
      ),
    );
  });

  if (lock.kind === "busy") return { kind: "busy", why: lock.why };
  return found ? { kind: "gone" } : { kind: "not-there" };
}

export function forget(root: string, summary: string): Forgotten {
  const path = join(root, DECISIONS_PATH);
  let found = false;

  const lock = withLock(path, () => {
    const held = readDecisions(root);
    const without = held.filter((one) => one.summary !== summary);
    if (without.length === held.length) return;
    found = true;
    writeAtomically(path, render(without));
  });

  if (lock.kind === "busy") return { kind: "busy", why: lock.why };
  return found ? { kind: "gone" } : { kind: "not-there" };
}

export function matching(decisions: readonly Decision[], query: string): readonly Decision[] {
  const wanted = query.toLowerCase();
  return decisions.filter(
    (one) =>
      one.summary.toLowerCase().includes(wanted) ||
      one.kind.toLowerCase().includes(wanted) ||
      one.body.toLowerCase().includes(wanted),
  );
}
