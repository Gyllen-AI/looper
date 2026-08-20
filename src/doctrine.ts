import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { canonBranch, canonBranchNames, canonConstitution } from "./canon.ts";
import {
  CONSTITUTION_PATH,
  DOCTRINE_DIR,
  DOCTRINE_SEPARATOR,
  branchHeading,
} from "./config.ts";

export type ProjectHalf =
  | { readonly kind: "absent" }
  | { readonly kind: "empty" }
  | { readonly kind: "present"; readonly text: string };

export type Assembly = {
  readonly text: string;
  readonly halves: readonly string[];
};

export function readProjectConstitution(root: string): ProjectHalf {
  const path = join(root, CONSTITUTION_PATH);
  if (!existsSync(path)) return { kind: "absent" };
  const text = readFileSync(path, "utf8").trim();
  if (text.length === 0) return { kind: "empty" };
  return { kind: "present", text };
}

const NOT_A_BRANCH: readonly string[] = ["constitution", "README"];

function stemsUnder(dir: string, prefix: string): readonly string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...stemsUnder(join(dir, entry.name), `${prefix}${entry.name}/`));
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    found.push(`${prefix}${entry.name.slice(0, -".md".length)}`);
  }
  return found;
}

export function listBranches(root: string): readonly string[] {
  const names = new Set<string>(canonBranchNames());
  for (const stem of stemsUnder(join(root, DOCTRINE_DIR), "")) {
    if (NOT_A_BRANCH.includes(stem)) continue;
    names.add(stem);
  }
  return [...names].sort();
}

export type BranchLookup =
  | { readonly kind: "nowhere" }
  | { readonly kind: "found"; readonly text: string; readonly halves: readonly string[] };

const A_SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]*";
const A_FILE_STEM = new RegExp(`^${A_SEGMENT}(/${A_SEGMENT})*$`);

export function isABranchName(name: string): boolean {
  if (!A_FILE_STEM.test(name)) return false;
  if (name.includes("\\")) return false;
  return !name.includes("..");
}

export function readProjectBranch(root: string, name: string): ProjectHalf {
  if (!isABranchName(name)) return { kind: "absent" };
  const path = join(root, DOCTRINE_DIR, `${name}.md`);
  if (!existsSync(path)) return { kind: "absent" };
  const text = readFileSync(path, "utf8").trim();
  if (text.length === 0) return { kind: "empty" };
  return { kind: "present", text };
}

export function assembleBranch(root: string, name: string): BranchLookup {
  const canon = canonBranch(name);
  const project = readProjectBranch(root, name);
  const halves: string[] = [];
  const bodies: string[] = [];

  if (canon.kind === "found") {
    halves.push("canon");
    bodies.push(canon.body);
  }
  if (project.kind === "present") {
    halves.push("project");
    bodies.push(project.text);
  }
  if (bodies.length === 0) return { kind: "nowhere" };

  return {
    kind: "found",
    text: `${branchHeading(name)}\n${bodies.join(DOCTRINE_SEPARATOR)}`,
    halves,
  };
}

const INDEX_HEADER = [
  "Every branch and its hardest rule. Name the ones your task touches and pull",
  "each with the doctrine tool before you act. The rest of the rule set is in the",
  "file, and a branch you do not pull is one you do not get.",
].join("\n");

const INDEX_CEILING = 2200;

const NAME_COLUMN = 14;

const RULE_WIDTH = 74;

const A_BOLD_LEAD = /\*\*([^*]+)\*\*/;

function firstSentence(said: string): string {
  const stop = said.search(/[.!?](\s|$)/);
  const whole = (stop < 0 ? said : said.slice(0, stop + 1)).trim().replace(/[:,;]$/, ".");
  if (whole.length <= RULE_WIDTH) return whole;
  const cut = whole.lastIndexOf(" ", RULE_WIDTH);
  return `${whole.slice(0, cut < 0 ? RULE_WIDTH : cut)} ...`;
}

function hardestRuleIn(text: string): string {
  const flat: string[] = [];
  let opening = "";
  let inFirst = false;
  for (const line of text.split("\n")) {
    const said = line.trim();
    if (said.startsWith("#") || said.startsWith("—")) continue;
    if (said.startsWith("- ") || said.startsWith("* ")) {
      if (inFirst) break;
      inFirst = true;
      flat.push(said.slice(2));
      continue;
    }
    if (said.length === 0) {
      if (inFirst) break;
      continue;
    }
    if (inFirst) flat.push(said);
    else if (opening === "") opening = said;
  }
  const joined = flat.join(" ").replace(/\s+/g, " ");
  const bold = A_BOLD_LEAD.exec(joined);
  if (bold !== null && bold[1] !== undefined) return firstSentence(bold[1]);
  if (joined.length > 0) return firstSentence(joined.replace(/\*\*/g, ""));
  return firstSentence(opening.replace(/\*\*/g, ""));
}

function ruleFor(root: string, name: string): string {
  const canon = canonBranch(name);
  if (canon.kind === "found") return hardestRuleIn(canon.body);
  const project = readProjectBranch(root, name);
  return project.kind === "present" ? hardestRuleIn(project.text) : "";
}

function rowsFor(root: string, withLeaves: boolean): readonly string[] {
  const groups = new Map<string, string[]>();
  const rows: string[] = [];
  for (const name of listBranches(root)) {
    const cut = name.indexOf("/");
    if (cut < 0) {
      const rule = ruleFor(root, name);
      if (rule.length > 0) rows.push(`- ${name.padEnd(NAME_COLUMN)}${rule}`);
      continue;
    }
    const head = name.slice(0, cut);
    const kids = groups.get(head);
    if (kids === undefined) groups.set(head, [name.slice(cut + 1)]);
    else kids.push(name.slice(cut + 1));
  }
  for (const [head, kids] of groups) {
    const shown = withLeaves ? kids.join(" ") : `${kids.length} branches, pull by name`;
    rows.push(`- ${`${head}/`.padEnd(NAME_COLUMN)}${shown}`);
  }
  return rows;
}

export function branchIndex(root: string): string {
  const full = rowsFor(root, true);
  const body = full.join("\n").length <= INDEX_CEILING ? full : rowsFor(root, false);
  return `${INDEX_HEADER}\n\n${body.join("\n")}`;
}

export function assembleConstitution(project: ProjectHalf): Assembly {
  const canon = canonConstitution();
  if (project.kind !== "present") {
    return { text: canon, halves: ["canon"] };
  }
  return {
    text: `${canon}${DOCTRINE_SEPARATOR}${project.text}`,
    halves: ["canon", "project"],
  };
}
