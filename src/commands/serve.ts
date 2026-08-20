import type { Out } from "../out.ts";
import { createInterface } from "node:readline";
import { ageOfOurCode } from "../code-age.ts";
import { handle } from "../mcp.ts";
import { dispatchHook, registry } from "../registry.ts";
import { here } from "../session.ts";

export function serve(out: Out): number {
  const capabilities = registry();
  const loaded = ageOfOurCode();
  const root = here();
  const reader = createInterface({ input: process.stdin });
  reader.on("line", (line: string) => {
    if (line.trim().length === 0) return;
    const reply = handle(capabilities, root, line, loaded);
    if (reply.kind === "message") {
      process.stdout.write(`${reply.text}\n`);
      return;
    }
    if (reply.kind === "unreadable") {
      out.warn(`looper: discarded a message it could not read (${reply.detail})`);
    }
  });
  return 0;
}
