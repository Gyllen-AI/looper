import { readFileSync } from "node:fs";

import { fieldAt } from "../src/fields.ts";

import { CHECKS } from "../src/law/checks.ts";
import { judge } from "../src/law/engine.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import type { Role } from "../src/law/rule.ts";

export type Probe = {
  readonly rule: string;
  readonly name: string;
  readonly code: string;
  readonly expect: "fires" | "silent";
  readonly file?: string;
  readonly role?: Role;
};

export function probesIn(text: string): readonly Probe[] {
  const held: unknown = JSON.parse(text);
  if (!Array.isArray(held)) throw new Error("the probe file must hold a list");
  return held.map((one, at) => {
    const rule = fieldAt(one, "rule");
    const name = fieldAt(one, "name");
    const code = fieldAt(one, "code");
    const expect = fieldAt(one, "expect");
    if (typeof rule !== "string" || typeof name !== "string" || typeof code !== "string") {
      throw new Error(`probe ${at} needs rule, name and code, all text`);
    }
    if (expect !== "fires" && expect !== "silent") {
      throw new Error(`probe ${at} must expect either fires or silent`);
    }
    return { rule, name, code, expect };
  });
}

export type Outcome = {
  readonly probe: Probe;
  readonly fired: readonly string[];
  readonly held: boolean;
};

const PASSES = ["fast", "slow"] as const;

export function firedOn(code: string, file: string, role: Role): readonly string[] {
  const said: string[] = [];
  for (const pass of PASSES) {
    const verdict = judge(CHECKS, pass, { file, text: code, role }, CONCEDING_NOTHING);
    for (const held of verdict.violations) said.push(held.rule.id);
  }
  return [...new Set(said)];
}

export function run(probes: readonly Probe[]): readonly Outcome[] {
  return probes.map((probe) => {
    const file = probe.file === undefined ? "src/probe.ts" : probe.file;
    const role = probe.role === undefined ? "backend" : probe.role;
    const fired = firedOn(probe.code, file, role);
    const hit = fired.includes(probe.rule);
    return { probe, fired, held: probe.expect === "fires" ? hit : !hit };
  });
}

function report(outcomes: readonly Outcome[]): void {
  const broken = outcomes.filter((o) => !o.held);
  for (const o of outcomes) {
    const mark = o.held ? "ok  " : "MISS";
    const saw = o.fired.length === 0 ? "nothing" : o.fired.join(",");
    console.log(`${mark} ${o.probe.rule.padEnd(20)} ${o.probe.expect.padEnd(6)} ${o.probe.name}`);
    if (!o.held) console.log(`       saw: ${saw}`);
  }
  console.log(`\n${outcomes.length - broken.length}/${outcomes.length} held, ${broken.length} did not`);
}

if (process.argv[2] !== undefined) {
  report(run(probesIn(readFileSync(process.argv[2], "utf8"))));
}
