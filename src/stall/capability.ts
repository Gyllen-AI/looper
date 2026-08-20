import { STALL_PRIORITY, whereTheUserLives } from "../config.ts";
import type { Capability, HookContext, HookEvent, InjectContext, Injection, Outcome, ToolCall, ToolDef, ToolResult } from "../capability.ts";
import { fieldAt, reasonFrom } from "../fields.ts";
import { metricOf, type Fingerprint } from "./fingerprints.ts";
import { note, reachedFor, shapeOf } from "./stream.ts";

const SILENT: readonly Injection[] = [];

const NO_TOOLS: readonly ToolDef[] = [];

const WATCHED: readonly HookEvent[] = ["PostToolUse"];

const DETAIL_KEYS: readonly string[] = ["command", "file_path", "pattern", "path"];

function detailIn(input: unknown): string {
  for (const key of DETAIL_KEYS) {
    const held = fieldAt(input, key);
    if (typeof held === "string") return held;
  }
  return "";
}

export function saidAbout(stalls: readonly Fingerprint[]): string {
  return [
    `looper: ${stalls.length} shape(s) in this session's last forty minutes look like being stuck, not like working.`,
    ...stalls.map((one) => `  ${one.shape} — ${one.times} times over ${one.minutes} minute(s): ${one.means}`),
    `Each one names a question the toolbox could not answer in a single call. The`,
    `answer to that shape is one more check, not a shorter one: the measure is least`,
    `input per unit of certainty, never least input, because a guess costs almost`,
    `nothing and is the worst outcome available.`,
  ].join("\n");
}

export class Stall implements Capability {
  readonly name = "stall";

  inject(context: InjectContext): readonly Injection[] {
    if (context.turn.session.kind === "unknown") return SILENT;
    const stream = reachedFor(context.root, whereTheUserLives(), context.turn.session.id);
    if (stream.kind !== "reached") return SILENT;
    const metric = metricOf(stream.reached, Date.now());
    if (metric.stalls.length === 0) return SILENT;
    return [
      {
        source: this.name,
        priority: STALL_PRIORITY,
        text: saidAbout(metric.stalls),
        required: false,
        notice: true,
      },
    ];
  }

  hooks(): readonly HookEvent[] {
    return WATCHED;
  }

  onHook(context: HookContext): Outcome {
    if (context.payload.kind === "none") return { kind: "pass" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(context.payload.text);
    } catch (cause) {
      return {
        kind: "mention",
        note: `looper: this tool call was not counted toward the stall metric (${reasonFrom(cause)}), so the metric is measuring less than happened.`,
      };
    }
    const tool = fieldAt(parsed, "tool_name");
    if (typeof tool !== "string") return { kind: "pass" };
    const who = fieldAt(parsed, "session_id");
    if (typeof who !== "string" || who.length === 0) {
      return {
        kind: "mention",
        note: "looper: this tool call carried no session id, so it was not counted toward the stall metric.",
      };
    }
    const noted = note(context.root, whereTheUserLives(), {
      at: Date.now(),
      tool,
      shape: shapeOf(tool, detailIn(fieldAt(parsed, "tool_input"))),
      session: who,
    });
    if (noted.kind === "not-noted") {
      return {
        kind: "mention",
        note: `looper: what this session reached for was not written down (${noted.why}), so the stall metric is measuring less than happened.`,
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
