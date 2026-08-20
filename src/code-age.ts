import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type Age = {
  readonly newest: number;
  readonly files: number;
};

function ourDirectory(): string {
  return import.meta.dirname;
}

function walked(dir: string): Age {
  let newest = 0;
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const below = walked(path);
      if (below.newest > newest) newest = below.newest;
      files += below.files;
      continue;
    }
    files += 1;
    const when = statSync(path).mtimeMs;
    if (when > newest) newest = when;
  }
  return { newest, files };
}

export function ageOfOurCode(): Age {
  return walked(ourDirectory());
}

export function agingSaid(loaded: Age): string {
  const now = ageOfOurCode();
  if (now.newest === loaded.newest && now.files === loaded.files) return "";
  return [
    "looper: this server is answering from the code it loaded when it started, and the",
    "code on disk has changed since. Anything below may be out of date, and a rule set",
    "it says does not exist may simply not have existed yet when this server began.",
    "Reconnect the looper MCP server and ask again.",
  ].join(" ");
}
