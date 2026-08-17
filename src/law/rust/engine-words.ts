import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RUST_ENGINE_DIR } from "../../config.ts";
import { required } from "../../present.ts";

const HELPS = join(RUST_ENGINE_DIR, "src", "helps.rs");

const NAMED = /Rule::(\w+) => ([A-Z_]+),/g;

const CONSTANT = /const ([A-Z_]+): &str = concat!\(([\s\S]*?)\);/g;

const PIECE = /"((?:[^"\\]|\\.)*)"/g;

const WORD = /\b([a-z][a-z0-9]*_[a-z0-9_*]*|unwrap|expect|matches|flatten|dbg|todo|panic)\b/g;

export type EngineBan = { readonly internal: string; readonly banned: ReadonlySet<string> };

function textOf(body: string): string {
  const parts: string[] = [];
  for (const held of body.matchAll(PIECE)) {
    const piece = held[1];
    if (piece === undefined) continue;
    parts.push(piece.replace(/\\n/g, " "));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function bansTheEngineDeclares(looperRoot: string): ReadonlyMap<string, EngineBan> {
  const source = readFileSync(join(looperRoot, HELPS), "utf8");

  const constants = new Map<string, string>();
  for (const held of source.matchAll(CONSTANT)) {
    const name = held[1];
    const body = held[2];
    if (name === undefined || body === undefined) continue;
    constants.set(name, textOf(body));
  }

  const found = new Map<string, EngineBan>();
  for (const held of source.matchAll(NAMED)) {
    const internal = held[1];
    const constant = held[2];
    if (internal === undefined || constant === undefined) continue;
    const text = constants.get(constant);
    if (text === undefined) continue;
    const banned = required(text.split(" why:")[0], "the banned half of a help text");
    const words = new Set<string>();
    for (const one of banned.matchAll(WORD)) {
      const word = one[1];
      if (word !== undefined) words.add(word);
    }
    found.set(internal, { internal, banned: words });
  }
  return found;
}
