import { NOT_A_WAY_THROUGH, PYTHON_EXTENSION, RUST_EXTENSION, STACK_PATH } from "../config.ts";
import { writeAtomically } from "../atomic.ts";
import { stackOf } from "../stack/read.ts";
import { stackDocument } from "../stack/write.ts";
import { judgePythonIn, judgeRustIn } from "./project.ts";
import { rustRuleFor } from "./rust/rules.ts";
import { roleOf, shapeOf } from "./shape.ts";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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
import { withLock } from "../atomic.ts";
import { isRecorded, readBaseline, countsOf, shrinkToward, totalIn, writeBaseline } from "./baseline.ts";
import { surveyProject, underAnotherLaw } from "./project.ts";
import { BASELINE_PATH, BASELINE_PRIORITY } from "../config.ts";
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

const EVERYTHING: readonly string[] = [];

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

function judgedByThePythonLaw(root: string, target: Judging): readonly Violation[] {
  const said = judgePythonIn(root, [target.path]);
  return said.violations.filter((held) => held.file === target.relative);
}

function lawFor(relative: string): "rust" | "python" | "typescript" {
  if (relative.endsWith(RUST_EXTENSION)) return "rust";
  if (relative.endsWith(PYTHON_EXTENSION)) return "python";
  return "typescript";
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
  if (underAnotherLaw(root, inside)) return { kind: "not-ours", path: inside };
  if (!JUDGED_EXTENSIONS.some((suffix) => inside.endsWith(suffix))) {
    return { kind: "not-ours", path: inside };
  }
  return { kind: "judge", path: full, relative: inside };
}

export type Typed =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "command"; readonly text: string };

export function commandFrom(payload: string): Typed {
  const held = fromToolInput(payload, "command", "command");
  if (held.kind === "none") return { kind: "none", why: held.why };
  return { kind: "command", text: held.value };
}

export function aboutToCommit(payload: string): boolean {
  const typed = commandFrom(payload);
  if (typed.kind === "none") return false;
  return intentOf(typed.text).kind === "commit";
}

function isUnreadableRust(violation: Violation): boolean {
  const known = rustRuleFor("ERROR:9");
  return known.kind === "known" && violation.rule.id === known.rule.id;
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

function wentUnjudged(blinding: readonly string[], staged: readonly string[]): string {
  return [
    `looper: ${blinding.join("; ")}, so the Rust half could not read that crate.`,
    `The ${staged.length} Rust file(s) staged here were not judged at all, which is not the same as being clean.`,
    "Nothing is blocked. Fix what the reader names and they can be seen again.",
  ].join(" ");
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

  const judged = staged.paths.filter(
    (path) =>
      JUDGED_EXTENSIONS.some((suffix) => path.endsWith(suffix)) &&
      !OUTSIDE_THE_LAW.some((part) => path.split("/").includes(part)) &&
      !underAnotherLaw(root, path),
  );

  const keep = (violation: Violation, path: string): void => {
    if (!isRecorded(baseline, path, violation.rule.id)) {
      violations.push(violation);
      return;
    }
    const touched = stagedLines(root, path);
    if (touched.kind === "lines" && touched.lines.has(violation.line)) {
      violations.push(violation);
    }
  };

  const inPython = judged.filter((path) => path.endsWith(PYTHON_EXTENSION));
  const stagedPython = new Set(inPython);
  const pythonSaid = judgePythonIn(root, inPython.map((path) => resolve(root, path)));
  for (const violation of pythonSaid.violations) {
    if (stagedPython.has(violation.file)) keep(violation, violation.file);
  }

  const inRust = judged.filter((path) => path.endsWith(RUST_EXTENSION));
  const stagedRust = new Set(inRust);
  const rustSaid = judgeRustIn(root, inRust.map((path) => resolve(root, path)));
  const blinding: string[] = [...rustSaid.unreadable, ...pythonSaid.unreadable];
  for (const violation of rustSaid.violations) {
    if (stagedRust.has(violation.file)) {
      keep(violation, violation.file);
      continue;
    }
    if (isUnreadableRust(violation)) {
      blinding.push(`${violation.file} cannot be read as Rust`);
    }
  }

  const shape = shapeOf(root);

  for (const path of judged) {
    if (lawFor(path) !== "typescript") continue;
    const held = stagedText(root, path);
    if (held.kind === "unreadable") continue;

    const found = judge(
      [...CHECKS, ...checksAdoptedIn(root)],
      "fast",
      { file: path, text: held.text, role: roleOf(shape, path) },
      concessions,
    ).violations;

    for (const violation of found) keep(violation, path);
  }

  if (violations.length === 0) {
    if (blinding.length > 0) return { kind: "mention", note: wentUnjudged(blinding, inRust) };
    return { kind: "pass" };
  }
  return {
    kind: "block",
    reason: `${formatReport(violations, "some-new")}\nNothing was committed.\n\n${NOT_A_WAY_THROUGH}`,
  };
}

export function writeStackIfAbsent(root: string): string {
  const path = join(root, STACK_PATH);
  if (existsSync(path)) return "";
  writeAtomically(path, stackDocument(stackOf(root), new Date().toISOString().slice(0, 10), root));
  return `looper: wrote ${STACK_PATH}, the record of what this project is built from, measured from what is on disk. Read it — adding a language later is a decision, and that file is where it becomes visible.`;
}

export function shrinkBaseline(root: string): Outcome {
  let said: Outcome = { kind: "pass" };
  const wrote = writeStackIfAbsent(root);

  const lock = withLock(join(root, BASELINE_PATH), () => {
    const recorded = readBaseline(root);
    if (totalIn(recorded) === 0) return;

    const shrink = shrinkToward(
      recorded,
      countsOf(surveyProject(root, "everything", EVERYTHING).violations),
    );
    if (shrink.kind === "unchanged") return;

    writeBaseline(root, shrink.baseline);
  });

  if (lock.kind === "busy") {
    said = {
      kind: "mention",
      note: `looper: the outstanding-work count was not updated (${lock.why}). Nothing was lost; it updates on the next turn.`,
    };
  }
  if (wrote.length > 0 && said.kind === "pass") return { kind: "mention", note: wrote };
  return said;
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

    const law = lawFor(target.relative);
    const found = law === "rust"
      ? judgedByTheRustLaw(context.root, target)
      : law === "python"
      ? judgedByThePythonLaw(context.root, target)
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
