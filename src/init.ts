import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeAtomically, type Backup } from "./atomic.ts";
import {
  LOCAL_BIN,
  CONSTITUTION_PATH,
  CONSTITUTION_STUB,
  DOCTRINE_README_PATH,
  DOCTRINE_README_STUB,
  MAP_PATH,
  MAP_STUB,
  MCP_PATH,
  mcpStub,
  SETTINGS_PATH,
  looperHooks,
  type Invocation,
} from "./config.ts";
import { hooksDirectory } from "./git.ts";
import {
  COMMIT_MSG,
  HOOK_MARKER,
  MESSAGE_MARKER,
  PRE_COMMIT,
  commitMessageScript,
  gitHookEntryFor,
  preCommitScript,
} from "./config.ts";
import { countsOf, totalIn, writeBaseline } from "./law/baseline.ts";
import { surveyProject } from "./law/project.ts";
import { BASELINE_PATH } from "./config.ts";
import { mergeSettings } from "./settings.ts";
import type { Existing } from "./types.ts";

export type Step =
  | {
      readonly kind: "created";
      readonly path: string;
      readonly wired: readonly string[];
    }
  | {
      readonly kind: "merged";
      readonly path: string;
      readonly wired: readonly string[];
      readonly backup: Backup;
    }
  | { readonly kind: "already-wired"; readonly path: string }
  | { readonly kind: "scaffolded"; readonly path: string }
  | { readonly kind: "yours-already"; readonly path: string }
  | {
      readonly kind: "surveyed";
      readonly files: number;
      readonly outstanding: number;
      readonly path: string;
    }
  | { readonly kind: "surveyed-clean"; readonly files: number }
  | { readonly kind: "gate-wired"; readonly hook: string; readonly path: string }
  | { readonly kind: "gate-already"; readonly hook: string; readonly path: string }
  | { readonly kind: "gate-yours"; readonly hook: string; readonly path: string; readonly line: string }
  | { readonly kind: "gate-impossible"; readonly hook: string; readonly why: string };

export type Report = {
  readonly steps: readonly Step[];
  readonly commitGate: "wired" | "not-wired";
};

type Stub = { readonly path: string; readonly body: string };

const STUBS: readonly Stub[] = [
  { path: CONSTITUTION_PATH, body: CONSTITUTION_STUB },
  { path: MAP_PATH, body: MAP_STUB },
  { path: DOCTRINE_README_PATH, body: DOCTRINE_README_STUB },
];

function readExisting(path: string): Existing {
  if (!existsSync(path)) return { kind: "absent" };
  return { kind: "present", text: readFileSync(path, "utf8") };
}

function wireSettings(root: string, invocation: Invocation): Step {
  const path = join(root, SETTINGS_PATH);
  const outcome = mergeSettings(readExisting(path), looperHooks(invocation));

  if (outcome.kind === "unchanged") return { kind: "already-wired", path };

  const written = writeAtomically(path, outcome.text);
  if (outcome.kind === "created") {
    return { kind: "created", path, wired: outcome.wired };
  }
  return {
    kind: "merged",
    path,
    wired: outcome.wired,
    backup: written.backup,
  };
}

function stubsFor(invocation: Invocation): readonly Stub[] {
  return [...STUBS, { path: MCP_PATH, body: mcpStub(invocation) }];
}

function scaffold(root: string, stub: Stub): Step {
  const path = join(root, stub.path);
  if (existsSync(path)) return { kind: "yours-already", path };
  writeAtomically(path, stub.body);
  return { kind: "scaffolded", path };
}

function gitHook(
  root: string,
  invocation: Invocation,
  name: string,
  marker: string,
  body: (entry: string) => string,
): Step {
  const dir = hooksDirectory(root);
  if (dir.kind === "none") return { kind: "gate-impossible", hook: name, why: dir.why };

  const path = join(root, dir.path, name);
  const line = `${gitHookEntryFor(invocation)} ${marker.slice("looper ".length)}`;

  if (existsSync(path)) {
    const held = readFileSync(path, "utf8");
    if (held.includes(marker)) return { kind: "gate-already", hook: name, path };
    return { kind: "gate-yours", hook: name, path, line };
  }

  writeAtomically(path, body(gitHookEntryFor(invocation)));
  chmodSync(path, 0o755);
  return { kind: "gate-wired", hook: name, path };
}

function commitGate(root: string, invocation: Invocation): Step {
  return gitHook(root, invocation, PRE_COMMIT, HOOK_MARKER, preCommitScript);
}

function messageGate(root: string, invocation: Invocation): Step {
  return gitHook(root, invocation, COMMIT_MSG, MESSAGE_MARKER, commitMessageScript);
}

function survey(root: string): Step {
  const found = surveyProject(root, "already-tracked");
  if (found.violations.length === 0) {
    return { kind: "surveyed-clean", files: found.files };
  }
  const counted = countsOf(found.violations);
  writeBaseline(root, counted);
  return {
    kind: "surveyed",
    files: found.files,
    outstanding: totalIn(counted),
    path: join(root, BASELINE_PATH),
  };
}

export function reachedFrom(root: string): Invocation {
  return existsSync(join(root, LOCAL_BIN)) ? "local" : "installed";
}

export function runInit(root: string, invocation: Invocation): Report {
  const steps: Step[] = [wireSettings(root, invocation)];
  for (const stub of stubsFor(invocation)) steps.push(scaffold(root, stub));
  steps.push(commitGate(root, invocation));
  steps.push(messageGate(root, invocation));
  if (!existsSync(join(root, BASELINE_PATH))) steps.push(survey(root));
  const gate = steps.some(
    (step) =>
      (step.kind === "gate-wired" || step.kind === "gate-already") &&
      step.hook === PRE_COMMIT,
  );
  return { steps, commitGate: gate ? "wired" : "not-wired" };
}
