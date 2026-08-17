import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeAtomically } from "../atomic.ts";
import { required } from "../present.ts";
import { RECALL_HEADER, RECALL_PATH } from "../config.ts";

export type Note = {
  readonly learned: string;
  readonly summary: string;
  readonly body: string;
};

const ENTRY = /^##\s+(\d{4}-\d{2}-\d{2})\s+—\s+(.*)$/;

export function parseNotes(source: string): readonly Note[] {
  const notes: Note[] = [];
  let learned = "";
  let summary = "";
  let body: string[] = [];

  const close = (): void => {
    if (summary.length === 0) return;
    notes.push({ learned, summary, body: body.join("\n").trim() });
  };

  for (const line of source.split("\n")) {
    const heading = ENTRY.exec(line);
    if (heading === null) {
      if (summary.length > 0) body.push(line);
      continue;
    }
    close();
    learned = required(heading[1], "the date on a recall heading");
    summary = required(heading[2], "the summary on a recall heading");
    body = [];
  }
  close();
  return notes;
}

export function readNotes(root: string): readonly Note[] {
  const path = join(root, RECALL_PATH);
  if (!existsSync(path)) return [];
  return parseNotes(readFileSync(path, "utf8"));
}

export function render(notes: readonly Note[]): string {
  const lines = [RECALL_HEADER];
  for (const note of notes) {
    lines.push(``, `## ${note.learned} — ${note.summary}`);
    if (note.body.length > 0) lines.push(note.body);
  }
  return `${lines.join("\n")}\n`;
}

export type Written =
  | { readonly kind: "added"; readonly total: number }
  | { readonly kind: "replaced"; readonly total: number };

export function remember(root: string, note: Note): Written {
  const held = readNotes(root);
  const without = held.filter((one) => one.summary !== note.summary);
  const replaced = without.length !== held.length;

  writeAtomically(join(root, RECALL_PATH), render([...without, note]));
  return { kind: replaced ? "replaced" : "added", total: without.length + 1 };
}

export function forget(root: string, summary: string): boolean {
  const held = readNotes(root);
  const without = held.filter((one) => one.summary !== summary);
  if (without.length === held.length) return false;
  writeAtomically(join(root, RECALL_PATH), render(without));
  return true;
}

export function matching(notes: readonly Note[], query: string): readonly Note[] {
  const wanted = query.toLowerCase();
  return notes.filter(
    (note) =>
      note.summary.toLowerCase().includes(wanted) ||
      note.body.toLowerCase().includes(wanted),
  );
}
