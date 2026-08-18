import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { judgeRustIn } from "../src/law/project.ts";
import { type RustCase } from "./rust-cases.ts";

export type Mismatch = {
  readonly held: RustCase;
  readonly got: "fires" | "silent";
};

export type Judged = {
  readonly mismatches: readonly Mismatch[];
  readonly known: readonly Mismatch[];
};

const MANIFEST = `[package]
name = "cases"
version = "0.1.0"
edition = "2021"

[lib]
path = "src/lib.rs"
`;

function fileFor(at: number): string {
  return `case_${at}.rs`;
}

export function judgeCases(cases: readonly RustCase[]): Judged {
  const crate = mkdtempSync(join(tmpdir(), "looper-rust-cases-"));
  try {
    mkdirSync(join(crate, "src"), { recursive: true });
    writeFileSync(join(crate, "Cargo.toml"), MANIFEST);
    writeFileSync(
      join(crate, "src", "lib.rs"),
      cases.map((_, at) => `pub mod case_${at};`).join("\n") + "\n",
    );
    for (const [at, held] of cases.entries()) {
      writeFileSync(join(crate, "src", fileFor(at)), `${held.code}\n`);
    }

    const said = judgeRustIn(crate, cases.map((_, at) => join(crate, "src", fileFor(at))));
    const mismatches: Mismatch[] = [];
    const known: Mismatch[] = [];

    for (const [at, held] of cases.entries()) {
      const fired = said.violations.some(
        (one) => one.file.endsWith(fileFor(at)) && one.rule.id === held.rule,
      );
      const got = fired ? "fires" : "silent";
      if (got === held.expect) continue;
      if (held.upstream === undefined) mismatches.push({ held, got });
      else known.push({ held, got });
    }
    return { mismatches, known };
  } finally {
    rmSync(crate, { recursive: true, force: true });
  }
}

export function say(judged: Judged): readonly string[] {
  return [
    ...judged.mismatches.map(
      (one) => `${one.held.rule.padEnd(22)} ${one.held.name}  (wanted ${one.held.expect}, got ${one.got})`,
    ),
    ...judged.known.map(
      (one) => `known miss, upstream:  ${one.held.rule.padEnd(18)} ${one.held.name}`,
    ),
  ];
}

