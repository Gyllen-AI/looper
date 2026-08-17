import type { Concessions } from "../concessions.ts";
import { isNamed } from "../concessions.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { reachIn, reaches } from "./globals.ts";

export const STRAY_PRINT: Rule = {
  id: "TS-LOG:1",
  category: "LOG",
  pass: "fast",
  bans: "`console.log` and the rest of the console family outside the file that starts the program",
  why:
    "what a program prints is its output, and it belongs to whoever ran it. A library that prints has decided for every future caller, including the one piping the output into something else. A left-behind `console.log` is also the most common way a secret ends up in a log file",
  instead: [
    "logger.info({ userId }, 'order placed')",
    "hand the failure back to the caller and let the entry point decide what to print",
  ],
  valve: {
    kind: "knob",
    key: "[entry] files",
    note: "the files that start the program; defaults to whatever package.json declares as main or bin",
  },
};

const CONSOLE: readonly string[] = ["console"];

export const strayPrintCheck: Check = {
  rule: STRAY_PRINT,

  run(subject: Subject, concessions: Concessions): readonly Finding[] {
    if (isNamed(subject.file, concessions.entryFiles)) return [];

    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const reach = reachIn(parsed.root);
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type !== "CallExpression") return;
      if (reaches(node["callee"], reach, CONSOLE)) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
