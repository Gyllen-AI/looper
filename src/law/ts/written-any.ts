import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { anyNode } from "./nodes.ts";

export const WRITTEN_ANY: Rule = {
  id: "TS-TYPE:4",
  category: "TYPE",
  pass: "fast",
  bans: "writing `any` as a type",
  why:
    "`any` is not a type, it is a note saying the checking stops here. Everything that value touches afterwards is unchecked too, so one `any` at the edge quietly turns off the checking for a whole path through the program",
  instead: [
    "unknown, then check what it is before using it",
    "const parsed: unknown = JSON.parse(text)",
    "write the shape you actually receive, even if it is only part of it",
  ],
  valve: { kind: "none" },
};

export const writtenAnyCheck: Check = {
  rule: WRITTEN_ANY,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      const written =
        node.type === "TSTypeAnnotation" ||
        node.type === "TSTypeAliasDeclaration" ||
        node.type === "TSTypeParameter";
      if (!written) return;
      if (anyNode(node, (held) => held.type === "TSAnyKeyword")) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
