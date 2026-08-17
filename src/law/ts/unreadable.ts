import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { parseSource } from "./parse.ts";

export const UNREADABLE_FILE: Rule = {
  id: "TS-ERROR:8",
  category: "ERROR",
  pass: "fast",
  bans: "a file that cannot be read as TypeScript at all",
  why:
    "every rule here works by reading the file. When it cannot be read, all of them find nothing, and nothing looks exactly like nothing wrong. One stray bracket is enough: the file is counted, judged by no rule at all, and reported as clean. A file in that state is also a file that will not build",
  instead: [
    "fix what the parser points at on the line named, and the rest of the rules can see the file again",
    "if the file is not TypeScript, give it the extension it actually is",
  ],
  valve: { kind: "none" },
};

export const unreadableFileCheck: Check = {
  rule: UNREADABLE_FILE,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind !== "unreadable") return [];
    return [{ line: parsed.line }];
  },
};
