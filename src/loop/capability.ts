import { LOOP_BYPASS, LOOP_IS_OLD_AFTER_MINUTES, LOOP_PRIORITY, whereTheUserLives } from "../config.ts";
import type { Capability, HookContext, HookEvent, InjectContext, Injection, Outcome, ToolCall, ToolDef, ToolResult } from "../capability.ts";
import { lastSeen, type Kept } from "./cache.ts";
import { declaredIn } from "./checks.ts";

const SILENT: readonly Injection[] = [];

const NO_TOOLS: readonly ToolDef[] = [];

const AT_COMMIT: readonly HookEvent[] = ["CommitMessage"];

export function bypassIn(message: string): string {
  for (const line of message.split("\n")) {
    const held = line.trimStart();
    if (held.startsWith(LOOP_BYPASS)) return held.slice(LOOP_BYPASS.length).trim();
  }
  return "";
}

export function namedOr(names: readonly string[]): string {
  if (names.length === 0) return "run looper loop to see which";
  return names.join(", ");
}

export function refusalFor(kept: Kept): string {
  const named = namedOr(kept.brokenNames);
  return [
    ``,
    `looper: ${kept.broken} check(s) this project declared are broken: ${named}.`,
    ``,
    `The constitution asks for the loop whole before anything is called done, and`,
    `this is the answer looper loop last wrote down. Nothing was run just now.`,
    ``,
    `Run looper loop. If they pass, this commit goes through with no further step,`,
    `because the answer it reads is the one that run writes.`,
    ``,
    `If you are committing on purpose with a check broken, say so in the message:`,
    ``,
    `  ${LOOP_BYPASS} <why, and what makes it safe>`,
    ``,
    `blind is not refused here. A layer that could not be asked is a fact about the`,
    `world rather than about this commit, and blocking on it is how a gate gets`,
    `turned off. It is still not ok, and looper says so on every prompt.`,
    ``,
  ].join("\n");
}

const MINUTE = 60 * 1000;

function minutesSince(at: string, now: number): number | undefined {
  const then = Date.parse(at);
  if (Number.isNaN(then)) return undefined;
  return Math.floor((now - then) / MINUTE);
}

function howOld(minutes: number | undefined): string {
  if (minutes === undefined) return "at a time this answer does not say";
  if (minutes < LOOP_IS_OLD_AFTER_MINUTES) return `${minutes} minute(s) ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour(s) ago, which is old enough to re-ask`;
}

export function saidAbout(kept: Kept, now: number): string {
  const failing = kept.failing.length === 0 ? "" : ` The layers that did not answer ok: ${kept.failing.join(", ")}.`;
  return [
    `looper: this project's loop was last asked ${howOld(minutesSince(kept.at, now))} —`,
    `ok=${kept.ok} broken=${kept.broken} blind=${kept.blind}.${failing}`,
    `blind is not ok: a layer that could not be asked cannot be called healthy.`,
    `Nothing was run to tell you this; it is the answer looper loop last wrote down.`,
  ].join(" ");
}

export class Loop implements Capability {
  readonly name = "loop";

  readonly home: string;

  constructor(home: string) {
    this.home = home;
  }

  inject(context: InjectContext): readonly Injection[] {
    const read = lastSeen(context.root, this.home);
    if (read.kind === "never") return SILENT;
    if (read.kind === "unreadable") {
      return [
        {
          source: this.name,
          priority: LOOP_PRIORITY,
          text: `looper: this project's last loop answer could not be read (${read.why}). Run looper loop to ask again.`,
          required: false,
        },
      ];
    }
    if (read.kept.broken === 0 && read.kept.blind === 0) return SILENT;
    return [
      {
        source: this.name,
        priority: LOOP_PRIORITY,
        text: saidAbout(read.kept, Date.now()),
        required: false,
      },
    ];
  }

  hooks(): readonly HookEvent[] {
    return AT_COMMIT;
  }

  onHook(context: HookContext): Outcome {
    if (context.event !== "CommitMessage") return { kind: "pass" };
    if (context.payload.kind === "none") return { kind: "pass" };
    if (bypassIn(context.payload.text).length > 0) return { kind: "pass" };
    if (declaredIn(context.root).checks.length === 0) return { kind: "pass" };

    const read = lastSeen(context.root, this.home);
    if (read.kind === "never") {
      return {
        kind: "mention",
        note: `looper: this project declares checks and the loop has never been asked. Run looper loop.`,
      };
    }
    if (read.kind === "unreadable") return { kind: "pass" };
    if (read.kept.broken > 0) return { kind: "block", reason: refusalFor(read.kept) };
    if (read.kept.blind > 0) {
      return {
        kind: "mention",
        note: `looper: ${read.kept.blind} layer(s) could not be asked: ${namedOr(read.kept.blindNames)}. Not refused, and not ok either.`,
      };
    }
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(request: ToolCall): ToolResult {
    return { kind: "unknown-tool", asked: request.tool };
  }
}
