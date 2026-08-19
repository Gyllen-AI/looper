import type { Out } from "../out.ts";
import { readFileSync } from "node:fs";
import { isHookEvent, type Payload } from "../capability.ts";
import { dispatchHook, registry } from "../registry.ts";
import { reasonFrom } from "../fields.ts";
import { here, remember } from "../session.ts";

function readPayload(out: Out): Payload {
  try {
    const text = readFileSync(0, "utf8");
    if (text.trim().length === 0) return { kind: "none" };
    return { kind: "text", text };
  } catch (cause) {
    const detail = reasonFrom(cause);
    out.warn(`looper: could not read the hook payload (${detail}); passing`);
    return { kind: "none" };
  }
}

export function hook(args: readonly string[], out: Out): number {
  const name = args[0];
  if (name === undefined) {
    out.warn("looper: hook needs an event name");
    return 2;
  }
  if (!isHookEvent(name)) {
    out.warn(`looper: ${name} is not an event looper answers; passing`);
    return 0;
  }
  remember(name, out);
  const result = dispatchHook(registry(), {
    root: here(),
    event: name,
    payload: name === "CommitMessage" ? readMessage(args[1], out) : readPayload(out),
  });
  for (const complaint of result.complaints) {
    out.warn(
      `looper: ${complaint.capability} could not reach a verdict (${complaint.detail}); passing`,
    );
  }
  if (result.refusals.length > 0) {
    for (const refusal of result.refusals) out.warn(refusal.reason);
    return 2;
  }
  for (const mention of result.mentions) {
    out.say(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: name,
          additionalContext: mention.note,
        },
      }),
    );
  }
  return 0;
}

function readMessage(path: string | undefined, out: Out): Payload {
  if (path === undefined) {
    out.warn("looper: the commit-message check needs the message file; passing");
    return { kind: "none" };
  }
  try {
    return { kind: "text", text: readFileSync(path, "utf8") };
  } catch (cause) {
    const detail = reasonFrom(cause);
    out.warn(`looper: could not read the commit message (${detail}); passing`);
    return { kind: "none" };
  }
}
