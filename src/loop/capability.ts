import { LOOP_IS_OLD_AFTER_MINUTES, LOOP_PRIORITY, whereTheUserLives } from "../config.ts";
import type { Capability, HookContext, InjectContext, Injection, Outcome, ToolCall, ToolDef, ToolResult } from "../capability.ts";
import { lastSeen, type Kept } from "./cache.ts";

const SILENT: readonly Injection[] = [];

const NO_TOOLS: readonly ToolDef[] = [];

const NO_EVENTS: readonly [] = [];

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

  inject(context: InjectContext): readonly Injection[] {
    const read = lastSeen(context.root, whereTheUserLives());
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

  hooks(): readonly [] {
    return NO_EVENTS;
  }

  onHook(_context: HookContext): Outcome {
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(request: ToolCall): ToolResult {
    return { kind: "unknown-tool", asked: request.tool };
  }
}
