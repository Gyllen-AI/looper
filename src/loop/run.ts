import { spawnSync, type SpawnSyncReturns } from "node:child_process";

import { A_READER_MAY_ANSWER_WITH } from "../config.ts";
import { reasonFrom } from "../fields.ts";
import type { Check, Reach } from "./checks.ts";

export type Verdict = "ok" | "broken" | "blind";

export type Seen = {
  readonly label: string;
  readonly reach: Reach;
  readonly verdict: Verdict;
  readonly detail: string;
  readonly millis: number;
};

export type Tally = {
  readonly ok: number;
  readonly broken: number;
  readonly blind: number;
  readonly failing: readonly string[];
};

export const BLIND_EXIT = 3;

const NO_DETAIL = "no detail";

function firstLine(raw: string): string {
  for (const line of raw.split("\n")) {
    const said = line.trim();
    if (said.length > 0) return said;
  }
  return NO_DETAIL;
}

function whatItSaid(answered: SpawnSyncReturns<string>): string {
  const out = typeof answered.stdout === "string" ? answered.stdout : "";
  const err = typeof answered.stderr === "string" ? answered.stderr : "";
  const said = `${out}${err}`;
  if (said.trim().length > 0) return said;
  if (answered.error !== undefined) return reasonFrom(answered.error);
  if (answered.signal !== null) return `stopped by ${answered.signal} with nothing said`;
  return NO_DETAIL;
}

export function verdictOf(status: number | null, reach: Reach, answered: boolean): Verdict {
  if (!answered) return reach === "external" ? "blind" : "broken";
  if (status === 0) return "ok";
  if (status === BLIND_EXIT && reach === "external") return "blind";
  if (status === null) return reach === "external" ? "blind" : "broken";
  return "broken";
}

export function ask(check: Check, root: string, seconds: number): Seen {
  const began = Date.now();
  const answered = spawnSync("sh", ["-c", check.run], {
    cwd: root,
    encoding: "utf8",
    timeout: seconds * 1000,
    maxBuffer: A_READER_MAY_ANSWER_WITH,
  });
  const millis = Date.now() - began;
  const said = whatItSaid(answered);
  const verdict = verdictOf(answered.status, check.reach, answered.error === undefined);
  return { label: check.label, reach: check.reach, verdict, detail: firstLine(said), millis };
}

export function tallyOf(seen: readonly Seen[]): Tally {
  const failing: string[] = [];
  let ok = 0;
  let broken = 0;
  let blind = 0;
  for (const one of seen) {
    if (one.verdict === "ok") {
      ok += 1;
      continue;
    }
    failing.push(one.label);
    if (one.verdict === "blind") blind += 1;
    else broken += 1;
  }
  return { ok, broken, blind, failing };
}
