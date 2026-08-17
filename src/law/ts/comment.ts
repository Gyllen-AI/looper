import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { parseSource } from "./parse.ts";

export const COMMENT: Rule = {
  id: "TS-DEAD:2",
  category: "DEAD",
  pass: "fast",
  bans: "comments, all of them — `//`, `/* */`, and the documentation kind `/** */`",
  why:
    "nothing checks a comment. The code around it changes and the comment stays, so it slowly becomes a confident description of something that is no longer true — and it is the part a reader believes, because it is the part written in words they understand. The name of a thing cannot go stale in that way, because the compiler reads it too",
  instead: [
    "a rule about a value becomes a type, or a check: if (total < 0) throw new NegativeTotal(total)",
    "an explanation becomes a name: renameOrdersOlderThanAYear() needs no comment above it",
    "the reason you did it goes in the commit message, where it is dated and attached to the change",
    "longer background goes in a .md file beside the code, which looper never asks you to keep in your head",
  ],
  valve: { kind: "none" },
};

const A_LICENCE = /copyright|SPDX|licen[cs]e/i;

function isDirective(comment: Comment): boolean {
  return comment.value.startsWith("/") && comment.value.includes("<reference");
}

function isLicenceHeader(comment: Comment): boolean {
  if (comment.loc === null || comment.loc.start.line !== 1) return false;
  return A_LICENCE.test(comment.value);
}

export const commentCheck: Check = {
  rule: COMMENT,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    return parsed.comments
      .filter((comment) => !isDirective(comment) && !isLicenceHeader(comment))
      .map((comment) => ({ line: comment.loc === null ? 0 : comment.loc.start.line }));
  },
};
