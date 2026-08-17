import { SUPPRESSIONS } from "../../config.ts";
import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { parseSource } from "./parse.ts";

export const SUPPRESSION: Rule = {
  id: "TS-DEAD:1",
  category: "DEAD",
  pass: "fast",
  bans: "`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, and `eslint-disable`",
  why:
    "the compiler is the one reader here that cannot be talked round. Silencing it does not fix what it saw, it only makes the next person believe there was nothing to see. This is also the rule that keeps every compiler setting honest, because a setting that can be muted line by line is not on",
  instead: [
    "fix what the compiler is pointing at",
    "if the type is genuinely wrong, correct the type",
    "if a library's types are wrong, describe the shape you actually receive and check it at the edge",
  ],
  valve: { kind: "none" },
};

export const suppressionCheck: Check = {
  rule: SUPPRESSION,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    for (const comment of parsed.comments) {
      if (!SUPPRESSIONS.some((marker) => comment.value.includes(marker))) continue;
      found.push({ line: comment.loc === null ? 0 : comment.loc.start.line });
    }
    return found;
  },
};
