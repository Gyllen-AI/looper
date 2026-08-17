import { readFileSync } from "node:fs";
import { join } from "node:path";

import { writeAtomically } from "../atomic.ts";
import { REPORT_DEPTH, REPORT_PATH, SERVER_VERSION } from "../config.ts";
import { judgedFiles } from "../law/project.ts";
import { render, shapeAt } from "./skeleton.ts";
import { reasonFrom } from "../fields.ts";

const WORD = /[A-Za-z_$][A-Za-z0-9_$]{2,}/g;

const OURS: ReadonlySet<string> = new Set([
  "looper",
  "report",
  "rule",
  "shape",
  "tried",
  "version",
  "name",
  "value",
  "removed",
  "async",
  "computed",
  "static",
  "optional",
  "prefix",
  "generator",
  "operator",
  "kind",
  "TypeScript",
  "This",
  "The",
  "and",
  "the",
  "was",
  "not",
  "for",
  "from",
  "with",
  "that",
  "what",
  "left",
  "here",
  "nothing",
  "your",
  "code",
  "line",
  "file",
  "read",
  "sent",
  "you",
  "can",
  "see",
  "before",
  "goes",
  "anywhere",
]);

export type Leak = { readonly word: string };

export function wordsIn(text: string): ReadonlySet<string> {
  const words = text.match(WORD);
  return new Set(words === null ? [] : words);
}

export function leaksFrom(report: string, source: string): readonly Leak[] {
  const theirs = wordsIn(source);
  const leaks: Leak[] = [];
  for (const word of wordsIn(report)) {
    if (OURS.has(word)) continue;
    if (theirs.has(word)) leaks.push({ word });
  }
  return leaks;
}

export type Written =
  | { readonly kind: "no-shape"; readonly why: string }
  | { readonly kind: "cannot-be-sure"; readonly unreadable: readonly string[] }
  | { readonly kind: "would-leak"; readonly leaks: readonly Leak[] }
  | { readonly kind: "written"; readonly path: string; readonly body: string };

export type Request = {
  readonly root: string;
  readonly ruleId: string;
  readonly file: string;
  readonly line: number;
  readonly tried: string;
};

export type Vocabulary = {
  readonly words: ReadonlySet<string>;
  readonly unreadable: readonly string[];
};

export function everyWordInProject(root: string): Vocabulary {
  const words = new Set<string>();
  const unreadable: string[] = [];

  for (const path of judgedFiles(root)) {
    try {
      for (const word of wordsIn(readFileSync(path, "utf8"))) words.add(word);
    } catch (cause) {
      const detail = reasonFrom(cause);
      unreadable.push(`${path} (${detail})`);
    }
  }

  return { words, unreadable };
}

export function leaksAgainst(report: string, theirs: ReadonlySet<string>): readonly Leak[] {
  const leaks: Leak[] = [];
  for (const word of wordsIn(report)) {
    if (OURS.has(word)) continue;
    if (theirs.has(word)) leaks.push({ word });
  }
  return leaks;
}

export function buildReport(request: Request): Written {
  const source = readFileSync(join(request.root, request.file), "utf8");
  const located = shapeAt(request.file, source, request.line, REPORT_DEPTH);
  if (located.kind === "not-found") return { kind: "no-shape", why: located.why };

  const body = [
    `# looper report`,
    ``,
    `version: ${SERVER_VERSION}`,
    `rule: ${request.ruleId}`,
    ``,
    `## What was tried`,
    ``,
    request.tried,
    ``,
    `## The shape it fired on`,
    ``,
    "```",
    render(located.shape, 0),
    "```",
    ``,
    `## What is not here`,
    ``,
    `No name, no value and no path from the project this came from. The shape`,
    `above was built from a fixed list of syntax kinds; nothing was copied out of`,
    `the file. looper checked this report against that file before writing it and`,
    `would have refused to write it if a single word had matched.`,
    ``,
    `Read it yourself before it goes anywhere. looper cannot send it: it has no`,
    `way to reach the network at all.`,
    ``,
  ].join("\n");

  const vocabulary = everyWordInProject(request.root);
  if (vocabulary.unreadable.length > 0) {
    return { kind: "cannot-be-sure", unreadable: vocabulary.unreadable };
  }
  const theirs = new Set([...vocabulary.words, ...wordsIn(source)]);
  const leaks = leaksAgainst(body, theirs);
  if (leaks.length > 0) return { kind: "would-leak", leaks };

  const path = join(request.root, REPORT_PATH);
  writeAtomically(path, body);
  return { kind: "written", path, body };
}
