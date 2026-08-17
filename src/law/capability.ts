import { NOT_A_WAY_THROUGH, RUST_EXTENSION } from "../config.ts";
import { judgeRustIn } from "./project.ts";
import { roleOf, shapeOf } from "./shape.ts";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { JUDGED_EXTENSIONS, OUTSIDE_THE_LAW } from "../config.ts";
import { SILENT } from "../capability.ts";
import type {
  Capability,
  HookContext,
  HookEvent,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import { changedLines, stagedFiles, stagedLines, stagedText } from "../git.ts";
import { isRecorded, readBaseline, countsOf, shrinkToward, totalIn, writeBaseline } from "./baseline.ts";
import { surveyProject } from "./project.ts";
import { BASELINE_PRIORITY } from "../config.ts";
import { intentOf } from "./commit-command.ts";
import { readConcessions } from "./concessions.ts";
import { judge } from "./engine.ts";
import { formatReport } from "./report.ts";
import { CHECKS, knownRuleIds } from "./checks.ts";
import { misspelledIn } from "./misspelled.ts";
import { checksAdoptedIn } from "./adopted.ts";
import type { Violation } from "./rule.ts";
import type { Touched } from "../git.ts";
import { fieldAt, reasonFrom } from "../fields.ts";

const LAW_EVENTS: readonly HookEvent[] = [
  "PostToolUse",
  "PreToolUse",
  "PreCommit",
  "Stop",
];

const NO_TOOLS: readonly ToolDef[] = [];

export type Named =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "named"; readonly path: string };

export type Target =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "outside"; readonly path: string }
  | { readonly kind: "not-ours"; readonly path: string }
  | { readonly kind: "judge"; readonly path: string; readonly relative: string };

type FromInput =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "read"; readonly value: string };

function fromToolInput(payload: string, key: string, called: string): FromInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "none", why: `the hook payload was not JSON (${detail})` };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { kind: "none", why: "the hook payload was not an object" };
  }
  const input = fieldAt(parsed, "tool_input");
  if (input === null || typeof input !== "object") {
    return { kind: "none", why: "the hook payload named no tool input" };
  }
  const value = fieldAt(input, key);
  if (typeof value !== "string") {
    return { kind: "none", why: `the tool input carried no ${called}` };
  }
  return { kind: "read", value };
}

function fileFrom(payload: string): Named {
  const held = fromToolInput(payload, "file_path", "file");
  if (held.kind === "none") return held;
  return { kind: "named", path: held.value };
}

type Judging = { readonly path: string; readonly relative: string };

function judgedByTheRustLaw(root: string, target: Judging): readonly Violation[] {
  const said = judgeRustIn(root, [target.path]);
  return said.violations.filter((held) => held.file === target.relative);
}

export function targetOf(root: string, payload: string): Target {
  const named = fileFrom(payload);
  if (named.kind === "none") return named;

  const full = resolve(root, named.path);
  const inside = relative(resolve(root), full);
  if (inside.startsWith("..") || inside.length === 0) {
    return { kind: "outside", path: full };
  }
  if (OUTSIDE_THE_LAW.some((part) => inside.split("/").includes(part))) {
    return { kind: "not-ours", path: inside };
  }
  if (!JUDGED_EXTENSIONS.some((suffix) => inside.endsWith(suffix))) {
    return { kind: "not-ours", path: inside };
  }
  return { kind: "judge", path: full, relative: inside };
}

export function aboutToCommit(payload: string): boolean {
  const held = fromToolInput(payload, "command", "command");
  if (held.kind === "none") return false;
  return intentOf(held.value).kind === "commit";
}

type Split = {
  readonly yours: readonly Violation[];
  readonly older: readonly Violation[];
};

function separate(
  root: string,
  file: string,
  violations: readonly Violation[],
  touched: Touched,
): Split {
  const baseline = readBaseline(root);
  const yours: Violation[] = [];
  const older: Violation[] = [];

  for (const violation of violations) {
    if (!isRecorded(baseline, file, violation.rule.id)) {
      yours.push(violation);
      continue;
    }
    if (touched.kind === "lines" && touched.lines.has(violation.line)) {
      yours.push(violation);
      continue;
    }
    older.push(violation);
  }
  return { yours, older };
}

function alsoHere(older: readonly Violation[]): string {
  if (older.length === 0) return "";
  return `\n\nThis file also has ${older.length} thing(s) that were here before looper arrived. They are not blocking you. Fixing one while you are already in the file is the cheapest it will ever be.`;
}

function invitation(file: string, older: readonly Violation[]): string {
  const named = older.map((violation) => `${violation.rule.id} on line ${violation.line}`);
  return `looper: ${file} still has ${older.length} thing(s) from before looper arrived — ${named.join(", ")}. Nothing is blocked. You are already in this file, which is the cheapest moment there will be to fix one.`;
}

export function judgeStaged(root: string): Outcome {
  const staged = stagedFiles(root);
  if (staged.kind === "unavailable") return { kind: "pass" };

  const concessions = readConcessions(root);
  const baseline = readBaseline(root);
  const violations = [];

  for (const path of staged.paths) {
    if (!JUDGED_EXTENSIONS.some((suffix) => path.endsWith(suffix))) continue;
    if (OUTSIDE_THE_LAW.some((part) => path.split("/").includes(part))) continue;
    const held = stagedText(root, path);
    if (held.kind === "unreadable") continue;

    const touched = stagedLines(root, path);
    const found = judge(
      [...CHECKS, ...checksAdoptedIn(root)],
      "fast",
      { file: path, text: held.text },
      concessions,
    ).violations;

    for (const violation of found) {
      if (!isRecorded(baseline, path, violation.rule.id)) {
        violations.push(violation);
        continue;
      }
      if (touched.kind === "lines" && touched.lines.has(violation.line)) {
        violations.push(violation);
      }
    }
  }

  if (violations.length === 0) return { kind: "pass" };
  return {
    kind: "block",
    reason: `${formatReport(violations, "some-new")}\nNothing was committed.\n\n${NOT_A_WAY_THROUGH}`,
  };
}

export function shrinkBaseline(root: string): Outcome {
  const recorded = readBaseline(root);
  if (totalIn(recorded) === 0) return { kind: "pass" };

  const shrink = shrinkToward(recorded, countsOf(surveyProject(root, "everything").violations));
  if (shrink.kind === "unchanged") return { kind: "pass" };

  writeBaseline(root, shrink.baseline);
  return { kind: "pass" };
}

export class Law implements Capability {
  readonly name = "law";

  inject(context: InjectContext): readonly Injection[] {
    const outstanding = totalIn(readBaseline(context.root));
    if (outstanding === 0) return SILENT;
    return [
      {
        source: "law",
        priority: BASELINE_PRIORITY,
        text: `looper: ${outstanding} thing(s) in this project were already here before looper arrived and are still to fix. They block nothing. Fixing one while you are already in that file is the cheapest it will ever be.`,
      },
    ];
  }

  hooks(): readonly HookEvent[] {
    return LAW_EVENTS;
  }

  onHook(context: HookContext): Outcome {
    if (context.event === "PreCommit") return judgeStaged(context.root);
    if (context.event === "Stop") return shrinkBaseline(context.root);
    if (context.payload.kind === "none") return { kind: "pass" };
    if (context.event === "PreToolUse") {
      if (!aboutToCommit(context.payload.text)) return { kind: "pass" };
      return judgeStaged(context.root);
    }

    const mistyped = misspelledIn(readConcessions(context.root), knownRuleIds());
    if (mistyped.length > 0) return { kind: "mention", note: mistyped.join("\n") };

    const target = targetOf(context.root, context.payload.text);
    if (target.kind === "none") {
      return {
        kind: "mention",
        note: `looper: this edit was not judged, because ${target.why}. Nothing here is a verdict on it.`,
      };
    }
    if (target.kind !== "judge") return { kind: "pass" };
    if (!existsSync(target.path)) return { kind: "pass" };

    const found = target.relative.endsWith(RUST_EXTENSION)
      ? judgedByTheRustLaw(context.root, target)
      : judge(
          [...CHECKS, ...checksAdoptedIn(context.root)],
          "fast",
          {
            file: target.relative,
            text: readFileSync(target.path, "utf8"),
            role: roleOf(shapeOf(context.root), target.relative),
          },
          readConcessions(context.root),
        ).violations;
    if (found.length === 0) return { kind: "pass" };
    const verdict = { violations: found };

    const split = separate(
      context.root,
      target.relative,
      verdict.violations,
      changedLines(context.root, target.relative, "commit"),
    );
    if (split.yours.length > 0) {
      return { kind: "block", reason: `${formatReport(split.yours, "some-new")}${alsoHere(split.older)}` };
    }
    return { kind: "mention", note: invitation(target.relative, split.older) };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(request: ToolCall): ToolResult {
    return { kind: "unknown-tool", asked: request.tool };
  }
}
