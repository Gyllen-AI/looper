import { existsSync } from "node:fs";
import { join } from "node:path";

import { DOCTRINE_DIR, FRESHNESS_BYPASS } from "./config.ts";
import { stagedFiles } from "./git.ts";
import { matches, readFreshnessMap, type Governs } from "./map.ts";

export type Stale = {
  readonly branch: string;
  readonly document: string;
  readonly area: string;
};

export type Verdict =
  | { readonly kind: "clean" }
  | { readonly kind: "bypassed"; readonly why: string }
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "stale"; readonly stale: readonly Stale[] };

const SCISSORS = "------------------------ >8 ------------------------";

export function bodyOf(message: string): string {
  const at = message.indexOf(SCISSORS);
  const kept = at === -1 ? message : message.slice(0, at);
  return kept
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n");
}

export function bypassIn(message: string): string {
  for (const line of bodyOf(message).split("\n")) {
    const held = line.trimStart();
    if (!held.startsWith(FRESHNESS_BYPASS)) continue;
    return held.slice(FRESHNESS_BYPASS.length).trim();
  }
  return "";
}

export function documentFor(branch: string): string {
  if (branch.endsWith(".md")) return branch;
  return `${DOCTRINE_DIR}/${branch}.md`;
}

export function assess(
  root: string,
  governs: Governs,
  staged: readonly string[],
): readonly Stale[] {
  const touched = new Set(staged);
  const stale: Stale[] = [];

  for (const [branch, globs] of governs) {
    const document = documentFor(branch);
    if (!existsSync(join(root, document))) continue;
    if (touched.has(document)) continue;

    const area = staged.find((path) =>
      globs.some((glob) => matches(glob, path)),
    );
    if (area === undefined) continue;
    stale.push({ branch, document, area });
  }
  return stale;
}

export function freshnessOf(root: string, message: string): Verdict {
  const why = bypassIn(message);
  if (why.length > 0) return { kind: "bypassed", why };

  const map = readFreshnessMap(root);
  if (map.kind !== "present" || map.governs.size === 0) return { kind: "clean" };

  const staged = stagedFiles(root);
  if (staged.kind === "unavailable") return { kind: "unavailable", detail: staged.detail };

  const stale = assess(root, map.governs, staged.paths);
  return stale.length === 0 ? { kind: "clean" } : { kind: "stale", stale };
}

export function saidAbout(stale: readonly Stale[]): string {
  const lines = [
    "",
    `looper: ${stale.length === 1 ? "a rule set has" : `${stale.length} rule sets have`} gone stale.`,
    "",
    "You changed code a rule set governs, and did not change the rule set. Nothing",
    "checks a document against the code it describes, so this is the only moment it",
    "can be noticed — after this commit it silently describes something else.",
    "",
  ];
  for (const held of stale) {
    lines.push(`  ${held.branch}`);
    lines.push(`    governs        ${held.area}`);
    lines.push(`    and lives in   ${held.document}`);
  }
  lines.push("");
  lines.push("Two ways on, and both are a decision rather than a formality:");
  lines.push("");
  lines.push("  update the document, stage it, and commit again");
  lines.push(`  or say why nothing changed, on its own line in the message:`);
  lines.push(`      ${FRESHNESS_BYPASS} the rename does not touch what this describes`);
  lines.push("");
  return lines.join("\n");
}
