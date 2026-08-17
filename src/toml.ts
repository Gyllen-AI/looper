import { required } from "./present.ts";
import { TomlMalformed } from "./errors.ts";

export type TomlValue = string | number | readonly string[];

export type TomlTable = ReadonlyMap<string, TomlValue>;

export type TomlDocument = ReadonlyMap<string, TomlTable>;

export const ROOT_SECTION = "";

function unquote(piece: string, line: number, what: string): string {
  const first = piece.at(0);
  const last = piece.at(-1);
  if (piece.length < 2 || first !== '"' || last !== '"') {
    throw new TomlMalformed(what, line, `expected double quotes around ${piece}`);
  }
  return piece.slice(1, -1);
}

function withoutComment(line: string): string {
  let inQuotes = false;
  for (let at = 0; at < line.length; at += 1) {
    const here = line[at];
    if (here === '"') inQuotes = !inQuotes;
    if (here === "#" && !inQuotes) return line.slice(0, at);
  }
  return line;
}

function list(body: string, line: number, what: string): readonly string[] {
  const inner = body.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return inner
    .split(",")
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
    .map((piece) => unquote(piece, line, what));
}

function value(raw: string, line: number, what: string): TomlValue {
  const body = raw.trim();
  if (body.startsWith("[")) {
    if (!body.endsWith("]")) {
      throw new TomlMalformed(what, line, "a list must close with ]");
    }
    return list(body, line, what);
  }
  if (body.startsWith('"')) return unquote(body, line, what);
  const asNumber = Number(body);
  if (body.length > 0 && Number.isFinite(asNumber)) return asNumber;
  throw new TomlMalformed(
    what,
    line,
    `expected a number, a quoted string, or a list, found ${body}`,
  );
}

function sectionName(line: string, at: number, what: string): string {
  if (!line.endsWith("]")) {
    throw new TomlMalformed(what, at, "a section heading must close with ]");
  }
  const name = line.slice(1, -1).trim();
  if (name.length === 0) throw new TomlMalformed(what, at, "a section needs a name");
  return unquoteKey(name);
}

function opensAList(body: string): boolean {
  const held = body.trim();
  return held.startsWith("[") && !held.endsWith("]");
}

export function parseToml(source: string, what: string): TomlDocument {
  const document = new Map<string, Map<string, TomlValue>>();
  document.set(ROOT_SECTION, new Map());
  const lines = source.split("\n");
  let current = ROOT_SECTION;
  let at = 0;

  while (at < lines.length) {
    const raw = required(lines[at], "a line of the file being read");
    at += 1;
    const line = withoutComment(raw).trim();
    if (line.length === 0) continue;
    if (line.startsWith("[")) {
      current = sectionName(line, at, what);
      if (!document.has(current)) document.set(current, new Map());
      continue;
    }
    const split = line.indexOf("=");
    if (split === -1) {
      throw new TomlMalformed(what, at, `expected "key = value", found ${line}`);
    }
    const key = line.slice(0, split).trim();
    if (key.length === 0) throw new TomlMalformed(what, at, "a key needs a name");
    const table = document.get(current);
    if (table === undefined) throw new TomlMalformed(what, at, "no open section");

    const opened = at;
    let body = line.slice(split + 1);
    while (opensAList(body)) {
      if (at >= lines.length) {
        throw new TomlMalformed(what, opened, "a list must close with ]");
      }
      body = `${body} ${withoutComment(required(lines[at], "the next line of a list")).trim()}`;
      at += 1;
    }
    table.set(unquoteKey(key), value(body, opened, what));
  }

  return document;
}

function unquoteKey(key: string): string {
  const first = key.at(0);
  const last = key.at(-1);
  if (key.length >= 2 && first === '"' && last === '"') return key.slice(1, -1);
  return key;
}

export function tableIn(document: TomlDocument, section: string): TomlTable {
  const found = document.get(section);
  if (found === undefined) return new Map();
  return found;
}

export function stringsAt(
  table: TomlTable,
  key: string,
  what: string,
): readonly string[] {
  const held = table.get(key);
  if (held === undefined) return [];
  if (typeof held === "string" || typeof held === "number") {
    throw new TomlMalformed(what, 0, `${key} must be a list`);
  }
  return held;
}

export function oneOrManyAt(
  table: TomlTable,
  key: string,
  what: string,
): readonly string[] {
  const held = table.get(key);
  if (held === undefined) return [];
  if (typeof held === "string") return [held];
  return stringsAt(table, key, what);
}

export function numberAt(table: TomlTable, key: string, fallback: number): number {
  const held = table.get(key);
  if (typeof held === "number") return held;
  return fallback;
}
