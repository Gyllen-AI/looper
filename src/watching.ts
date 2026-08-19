import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { JUDGED_EXTENSIONS, OUTSIDE_THE_LAW } from "./config.ts";
import { changedPaths } from "./git.ts";
import { writeAtomically } from "./atomic.ts";
import { reasonFrom } from "./fields.ts";

const WATCH_DIR = join(".looper", "seen");

const NAME_LENGTH = 12;

export function watchPath(root: string, home: string): string {
  const print = createHash("sha256").update(root).digest("hex").slice(0, NAME_LENGTH);
  return join(home, WATCH_DIR, `${basename(root)}-${print}.bash`);
}

export function aCommandIsAboutToRun(root: string, home: string): void {
  writeAtomically(watchPath(root, home), "a command is running\n");
}

export type Since =
  | { readonly kind: "no-mark" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "at"; readonly at: number };

export function whenTheCommandStarted(root: string, home: string): Since {
  const path = watchPath(root, home);
  if (!existsSync(path)) return { kind: "no-mark" };
  try {
    return { kind: "at", at: statSync(path).mtimeMs };
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
}

export type Written =
  | { readonly kind: "cannot-tell"; readonly why: string }
  | {
      readonly kind: "files";
      readonly paths: readonly string[];
      readonly vanished: readonly string[];
    };

function worthJudging(path: string): boolean {
  if (!JUDGED_EXTENSIONS.some((suffix) => path.endsWith(suffix))) return false;
  return !OUTSIDE_THE_LAW.some((part) => path.split("/").includes(part));
}

export function writtenSince(root: string, at: number): Written {
  const changed = changedPaths(root);
  if (changed.kind === "unavailable") return { kind: "cannot-tell", why: changed.detail };

  const paths: string[] = [];
  const vanished: string[] = [];
  for (const path of changed.paths) {
    if (!worthJudging(path)) continue;
    let held;
    try {
      held = statSync(resolve(root, path));
    } catch (cause) {
      vanished.push(`${path} (${reasonFrom(cause)})`);
      continue;
    }
    if (held.mtimeMs >= at) paths.push(path);
  }
  return { kind: "files", paths, vanished };
}
