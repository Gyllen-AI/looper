import { readFileSync } from "node:fs";

import type { Out } from "../out.ts";
import { NO_TURN, type Session, type Turn } from "../capability.ts";
import { fieldAt, reasonFrom } from "../fields.ts";
import { remember, allocationFor } from "../session.ts";

function sessionIn(parsed: unknown): Session {
  const id = fieldAt(parsed, "session_id");
  if (typeof id !== "string" || id.length === 0) return { kind: "unknown" };
  return { kind: "known", id };
}

function promptIn(parsed: unknown): string {
  const prompt = fieldAt(parsed, "prompt");
  return typeof prompt === "string" ? prompt : "";
}

export type Read =
  | { readonly kind: "turn"; readonly turn: Turn }
  | { readonly kind: "unreadable"; readonly why: string };

export function turnFrom(text: string): Read {
  if (text.trim().length === 0) return { kind: "turn", turn: NO_TURN };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  return {
    kind: "turn",
    turn: { session: sessionIn(parsed), prompt: promptIn(parsed), inHand: { kind: "from-git" } },
  };
}

function readTurn(out: Out): Turn {
  try {
    const read = turnFrom(readFileSync(0, "utf8"));
    if (read.kind === "turn") return read.turn;
    out.warn(`looper: the prompt payload could not be read (${read.why}); notices will repeat`);
    return NO_TURN;
  } catch (cause) {
    const detail = reasonFrom(cause);
    out.warn(`looper: could not read the prompt payload (${detail}); notices will repeat`);
    return NO_TURN;
  }
}

export function inject(out: Out): number {
  remember("UserPromptSubmit", out);
  const allocation = allocationFor(out, readTurn(out));
  if (allocation.text.length === 0) return 0;
  out.say(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: allocation.text,
      },
    }),
  );
  return 0;
}
