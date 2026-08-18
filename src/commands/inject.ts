import type { Out } from "../out.ts";
import { here, remember, currentAllocation } from "../session.ts";

export function inject(out: Out): number {
  remember("UserPromptSubmit", out);
  const allocation = currentAllocation(out);
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
