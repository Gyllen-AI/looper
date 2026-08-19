import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { reasonFrom } from "../fields.ts";

const STREAM_DIR = join(".looper", "seen");

const NAME_LENGTH = 12;

export const A_STREAM_HOLDS = 400;

export type Reached = {
  readonly at: number;
  readonly tool: string;
  readonly shape: string;
};

export type Stream =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "reached"; readonly reached: readonly Reached[] };

export function streamPath(root: string, home: string): string {
  const print = createHash("sha256").update(root).digest("hex").slice(0, NAME_LENGTH);
  return join(home, STREAM_DIR, `${basename(root)}-${print}.reached`);
}

const A_WORD = /[A-Za-z0-9_./-]+/g;

export function shapeOf(tool: string, detail: string): string {
  if (tool !== "Bash") return detail;
  const words = detail.match(A_WORD);
  if (words === null) return tool;
  return words.slice(0, 2).join(" ");
}

export type Noted =
  | { readonly kind: "noted" }
  | { readonly kind: "not-noted"; readonly why: string };

export function note(root: string, home: string, one: Reached): Noted {
  const path = streamPath(root, home);
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${one.at}\t${one.tool}\t${one.shape.replace(/[\t\n]/g, " ")}\n`);
    return { kind: "noted" };
  } catch (cause) {
    return { kind: "not-noted", why: reasonFrom(cause) };
  }
}

export function reachedFor(root: string, home: string): Stream {
  const path = streamPath(root, home);
  if (!existsSync(path)) return { kind: "none" };
  let held = "";
  try {
    held = readFileSync(path, "utf8");
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  const reached: Reached[] = [];
  for (const line of held.split("\n").slice(-A_STREAM_HOLDS)) {
    const parts = line.split("\t");
    const at = Number(parts[0]);
    const tool = parts[1];
    const shape = parts[2];
    if (!Number.isFinite(at) || tool === undefined || shape === undefined) continue;
    reached.push({ at, tool, shape });
  }
  return { kind: "reached", reached };
}
