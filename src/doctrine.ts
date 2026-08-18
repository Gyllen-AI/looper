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

export function listBranches(root: string): readonly string[] {
  const names = new Set<string>(canonBranchNames());
  const dir = join(root, DOCTRINE_DIR);
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".md")) continue;
      const stem = entry.slice(0, -".md".length);
      if (NOT_A_BRANCH.includes(stem)) continue;
      names.add(stem);
    }
  }
  return [...names].sort();
}

export type BranchLookup =
  | { readonly kind: "nowhere" }
  | { readonly kind: "found"; readonly text: string; readonly halves: readonly string[] };

const A_FILE_STEM = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isABranchName(name: string): boolean {
  if (!A_FILE_STEM.test(name)) return false;
  return !name.includes("..");
}

function readProjectBranch(root: string, name: string): ProjectHalf {
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
