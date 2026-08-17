import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CANON_DIR, DOCTRINE_DIR } from "./config.ts";

export type CanonBranch = {
  readonly name: string;
  readonly body: string;
};

const BRANCH_NAMES: readonly string[] = ["law", "process",
  "architecture", "rust", "doctrine",
];

const TYPESCRIPT: readonly string[] = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.mts",
  "**/*.cts",
  "**/*.js",
  "**/*.jsx",
  "**/*.mjs",
  "**/*.cjs",
];

const RUST: readonly string[] = ["**/*.rs"];

export function canonGoverns(): ReadonlyMap<string, readonly string[]> {
  return new Map([
    ["law", TYPESCRIPT],
    ["rust", RUST],
    ["doctrine", [`${DOCTRINE_DIR}/**`]],
  ]);
}

function read(name: string): string {
  return readFileSync(join(import.meta.dirname, CANON_DIR, `${name}.md`), "utf8").trim();
}

export function canonConstitution(): string {
  return read("constitution");
}

export function canonBranches(): readonly CanonBranch[] {
  return BRANCH_NAMES.map((name) => ({ name, body: read(name) }));
}

export function canonBranchNames(): readonly string[] {
  return BRANCH_NAMES;
}

export type CanonLookup =
  | { readonly kind: "nowhere" }
  | { readonly kind: "found"; readonly body: string };

export function canonBranch(name: string): CanonLookup {
  if (!BRANCH_NAMES.includes(name)) return { kind: "nowhere" };
  return { kind: "found", body: read(name) };
}
