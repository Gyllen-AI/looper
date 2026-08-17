import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { FRESHNESS_SECTION, GOVERNS_SECTION, MAP_PATH } from "./config.ts";
import { parseToml, stringsAt, tableIn } from "./toml.ts";

export type Governs = ReadonlyMap<string, readonly string[]>;

export type DoctrineMap =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly governs: Governs };

function governsIn(source: string, section: string): Governs {
  const document = parseToml(source, MAP_PATH);
  const table = tableIn(document, section);
  const governs = new Map<string, readonly string[]>();
  for (const [branch] of table) {
    governs.set(branch, stringsAt(table, branch, MAP_PATH));
  }
  return governs;
}

export function parseMap(source: string): Governs {
  return governsIn(source, GOVERNS_SECTION);
}

export function parseFreshnessMap(source: string): Governs {
  const own = governsIn(source, FRESHNESS_SECTION);
  return own.size > 0 ? own : governsIn(source, GOVERNS_SECTION);
}

export function readFreshnessMap(root: string): DoctrineMap {
  const path = join(root, MAP_PATH);
  if (!existsSync(path)) return { kind: "absent" };
  return { kind: "present", governs: parseFreshnessMap(readFileSync(path, "utf8")) };
}

export function readMap(root: string): DoctrineMap {
  const path = join(root, MAP_PATH);
  if (!existsSync(path)) return { kind: "absent" };
  return { kind: "present", governs: parseMap(readFileSync(path, "utf8")) };
}

function segmentMatches(pattern: string, segment: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === segment;

  const first = parts[0];
  const last = parts[parts.length - 1];
  if (first === undefined || last === undefined) return false;
  if (!segment.startsWith(first) || !segment.endsWith(last)) return false;
  if (segment.length < first.length + last.length) return false;

  let cursor = first.length;
  for (const middle of parts.slice(1, -1)) {
    const found = segment.indexOf(middle, cursor);
    if (found === -1) return false;
    cursor = found + middle.length;
  }
  return true;
}

function walk(pattern: readonly string[], path: readonly string[]): boolean {
  const head = pattern[0];
  if (head === undefined) return path.length === 0;
  if (head === "**") {
    const rest = pattern.slice(1);
    for (let skip = 0; skip <= path.length; skip += 1) {
      if (walk(rest, path.slice(skip))) return true;
    }
    return false;
  }
  const segment = path[0];
  if (segment === undefined) return false;
  if (!segmentMatches(head, segment)) return false;
  return walk(pattern.slice(1), path.slice(1));
}

export function matches(pattern: string, path: string): boolean {
  return walk(pattern.split("/"), path.split("/"));
}

export function branchesFor(governs: Governs, paths: readonly string[]): readonly string[] {
  const found: string[] = [];
  for (const [branch, globs] of governs) {
    const hit = paths.some((path) => globs.some((glob) => matches(glob, path)));
    if (hit) found.push(branch);
  }
  return found.sort();
}
