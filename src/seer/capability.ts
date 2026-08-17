import { join } from "node:path";

import { SEER_NAME_LIMIT, SEER_TOOL } from "../config.ts";
import { SILENT } from "../capability.ts";
import type {
  Capability,
  HookEvent,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import { capture, seerIsInstalled, type Image, type Shot } from "./drive.ts";

const NO_HOOKS: readonly HookEvent[] = [];

const NO_TOOLS: readonly ToolDef[] = [];

const WINDOW = "window";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

const SEE: ToolDef = {
  name: SEER_TOOL,
  description:
    "Look at a window on this machine and get back a picture of it, so a claim about what the running thing does is something you saw rather than something you believe. Only windows the person at this machine has armed can be seen; anything else comes back refused, and asking again will not change that.",
  inputSchema: {
    type: "object",
    properties: {
      window: {
        type: "string",
        description: "the title of the window to look at, as it appears on screen",
      },
    },
    required: [WINDOW],
  },
};

function looperRoot(): string {
  return join(import.meta.dirname, "..", "..");
}

type Asked =
  | { readonly kind: "refused"; readonly why: string }
  | { readonly kind: "window"; readonly name: string };

function windowIn(args: ReadonlyMap<string, string>): Asked {
  const held = args.get(WINDOW);
  if (held === undefined || held.trim().length === 0) {
    return { kind: "refused", why: `${SEER_TOOL} needs the title of a window to look at.` };
  }
  if (held.length > SEER_NAME_LIMIT) {
    return {
      kind: "refused",
      why: `that window title is longer than ${SEER_NAME_LIMIT} characters, which no window has.`,
    };
  }
  if (CONTROL_CHARACTER.test(held)) {
    return { kind: "refused", why: "a window title cannot contain control characters." };
  }
  return { kind: "window", name: held };
}

const NOT_WHAT_IT_SHOWS: Record<string, string> = {
  minimised:
    "was minimised, so this is what it last drew rather than what it shows now. Do not read it as the state of the running thing.",
  blank:
    "drew nothing into this picture, which usually means it renders on the graphics card and this way of capturing cannot see it. Do not read it as an empty screen.",
  unknown:
    "came back without saying whether it was actually rendering, so this picture may be stale. Treat it as unconfirmed.",
};

function warningsIn(images: readonly Image[]): string {
  const said: string[] = [];
  for (const held of images) {
    const warning = NOT_WHAT_IT_SHOWS[held.state];
    if (warning === undefined) continue;
    said.push(` "${held.label}" ${warning}`);
  }
  return said.join("");
}

export function answerFor(shot: Shot, window: string): ToolResult {
  if (shot.kind === "not-installed") {
    return {
      kind: "text",
      text: `looper cannot look at anything on this machine: no seer is installed for ${shot.platform}. Nothing was captured.`,
    };
  }
  if (shot.kind === "disarmed") {
    return {
      kind: "text",
      text: `"${window}" is not armed, so nothing was captured. Only the person at this machine can arm a window, in their own window for it, and asking again will not change the answer.`,
    };
  }
  if (shot.kind === "not-found") {
    return { kind: "text", text: `there is no window called "${shot.named}" on this machine.` };
  }
  if (shot.kind === "unavailable") {
    return {
      kind: "text",
      text: `looper could not look at "${window}" (${shot.detail}). Nothing was captured, and nothing here is a verdict on what is on screen.`,
    };
  }
  if (shot.images.length === 0) {
    const named = shot.missing.length === 0 ? "" : ` It named these as missing: ${shot.missing.join(", ")}.`;
    return { kind: "text", text: `the seer came back with no picture of "${window}".${named}` };
  }
  const missing =
    shot.missing.length === 0 ? "" : ` It could not find: ${shot.missing.join(", ")}.`;
  return {
    kind: "shown",
    said: `looked at "${window}".${missing}${warningsIn(shot.images)}`,
    images: shot.images.map((held) => ({ media: held.media, base64: held.base64 })),
  };
}

export class Seer implements Capability {
  readonly name = "seer";

  inject(): readonly Injection[] {
    return SILENT;
  }

  hooks(): readonly HookEvent[] {
    return NO_HOOKS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    if (!seerIsInstalled(looperRoot())) return NO_TOOLS;
    return [SEE];
  }

  call(request: ToolCall): ToolResult {
    if (request.tool !== SEER_TOOL) return { kind: "unknown-tool", asked: request.tool };

    const asked = windowIn(request.args);
    if (asked.kind === "refused") return { kind: "text", text: asked.why };

    return answerFor(capture(looperRoot(), asked.name), asked.name);
  }
}
