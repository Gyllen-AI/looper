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
import {
  capture,
  seerIsInstalled,
  startConsent,
  standing,
  type Image,
  type Shot,
  type Standing,
} from "./drive.ts";

const NO_HOOKS: readonly HookEvent[] = [];

const NO_TOOLS: readonly ToolDef[] = [];

const WINDOW = "window";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

const SEE: ToolDef = {
  name: SEER_TOOL,
  description:
    "Look at a window on this machine and get back a picture of it, so a claim about what the running thing does is something you saw rather than something you believe. Only windows the person at this machine has ticked in their own consent window can be seen.\n\nCall it with no argument first: it answers whether that consent window is running, which titles are ticked, and every window title currently open. Then ask for one of those titles exactly as it is written there, because a title you half remember is the usual reason a look comes back with nothing.",
  inputSchema: {
    type: "object",
    properties: {
      window: {
        type: "string",
        description: "the title of the window to look at, as it appears on screen",
      },
    },
  },
};

function looperRoot(): string {
  return join(import.meta.dirname, "..", "..");
}

type Asked =
  | { readonly kind: "refused"; readonly why: string }
  | { readonly kind: "asking-what-is-armed" }
  | { readonly kind: "window"; readonly name: string };

function windowIn(args: ReadonlyMap<string, string>): Asked {
  const held = args.get(WINDOW);
  if (held === undefined || held.trim().length === 0) {
    return { kind: "asking-what-is-armed" };
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
  if (shot.kind === "unreachable") {
    return {
      kind: "text",
      text: whenNotRunning().text,
    };
  }
  if (shot.kind === "disarmed") {
    return { kind: "text", text: `"${window}" is not ticked in the consent window, so nothing was captured.${alsoSaid(window)}` };
  }
  if (shot.kind === "not-found") {
    return { kind: "text", text: `there is no window called "${shot.named}" on this machine.${alsoSaid(shot.named)}` };
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

function nearlyNamed(wanted: string, open: readonly string[]): readonly string[] {
  const asked = wanted.toLowerCase();
  return open.filter((held) => {
    const one = held.toLowerCase();
    return one.includes(asked) || asked.includes(one);
  });
}

function whenNotRunning(): { readonly kind: "text"; readonly text: string } {
  const started = startConsent(looperRoot());
  if (started.kind === "no-consent-program") {
    return {
      kind: "text",
      text: `the consent window is not running and looper has no copy of it to start: nothing is at ${started.path}. Until it is there, nothing can be looked at.`,
    };
  }
  if (started.kind === "could-not-start") {
    return {
      kind: "text",
      text: `the consent window is not running and looper could not start it (${started.detail}). Nothing can be looked at.`,
    };
  }
  return {
    kind: "text",
    text: "the consent window was not running, so looper has just opened it on this machine. It lists every window that is open, with a tick box beside each. Nothing can be looked at until one is ticked there, which is the person's decision and not looper's. Ask again once it is.",
  };
}

function alsoSaid(window: string): string {
  const state = standing(looperRoot());
  if (state.kind !== "reachable") return "";
  const near = nearlyNamed(window, state.open).filter((held) => held !== window);
  const nearly =
    near.length === 0 ? "" : ` A window is open called ${near.map((held) => `"${held}"`).join(", ")}.`;
  const armed =
    state.armed.length === 0
      ? " Nothing at all is ticked right now."
      : ` What is ticked: ${state.armed.map((held) => `"${held}"`).join(", ")}.`;
  return `${nearly}${armed} Ticking is done by the person at this machine, in their consent window.`;
}

export function saidAbout(state: Standing): ToolResult {
  if (state.kind === "not-installed") {
    return {
      kind: "text",
      text: `looper cannot look at anything on this machine: no seer is installed for ${state.platform}. Nothing was captured.`,
    };
  }
  if (state.kind === "unavailable") {
    return {
      kind: "text",
      text: `looper could not ask what is armed (${state.detail}). Nothing here is a verdict on what is on screen.`,
    };
  }
  if (state.kind === "unreachable") return whenNotRunning();
  if (state.kind === "too-old") {
    return {
      kind: "text",
      text: "the consent window on this machine is an older build that cannot say what is ticked, so looper cannot list it. Looking at a window that has already been ticked still works. Closing that window is enough: looper opens the current one by itself the next time it is asked.",
    };
  }
  const armed =
    state.armed.length === 0
      ? "nothing is ticked, so nothing can be looked at yet"
      : `ticked, and able to be looked at: ${state.armed.map((held) => `"${held}"`).join(", ")}`;
  const open =
    state.open.length === 0
      ? ""
      : `\n\nEvery window open right now:\n${state.open.map((held) => `  ${held}`).join("\n")}`;
  return {
    kind: "text",
    text: `the consent window is running and ${armed}. Ask for a title exactly as it is written below.${open}`,
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
    if (asked.kind === "asking-what-is-armed") return saidAbout(standing(looperRoot()));

    return answerFor(capture(looperRoot(), asked.name), asked.name);
  }
}
