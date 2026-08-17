import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const ANONYMOUS_PROVENANCE: Rule = {
  id: "TS-DEAD:4",
  category: "DEAD",
  pass: "fast",
  bans: "`export *`, and `import * as` from a file of your own",
  why:
    "with `export *` nobody can tell where a name came from, and renaming something upstream silently changes what your file means without your file being touched. It also hides which part of the project you actually depend on, which is how a layer boundary gets crossed without anyone seeing it",
  instead: [
    "export { Order, OrderLine } from './order.ts'",
    "import { logger } from './logging.ts'",
  ],
  valve: { kind: "none" },
};

function isLocal(node: Node): boolean {
  const source = node["source"];
  const value = fieldAt(source, "value");
  return typeof value === "string" && value.startsWith(".");
}

function hasNamespaceSpecifier(node: Node): boolean {
  const specifiers = node["specifiers"];
  if (!Array.isArray(specifiers)) return false;
  return specifiers.some((held) => {
    if (held === null || typeof held !== "object") return false;
    const type = fieldAt(held, "type");
    return type === "ImportNamespaceSpecifier";
  });
}

export const anonymousProvenanceCheck: Check = {
  rule: ANONYMOUS_PROVENANCE,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (node.type === "ExportAllDeclaration") {
        found.push({ line: lineOfNode(node) });
        return;
      }
      if (node.type === "ExportNamedDeclaration") {
        const specifiers = node["specifiers"];
        if (!Array.isArray(specifiers)) return;
        const wholesale = specifiers.some(
          (held) => fieldAt(held, "type") === "ExportNamespaceSpecifier",
        );
        if (wholesale) found.push({ line: lineOfNode(node) });
        return;
      }
      if (node.type !== "ImportDeclaration") return;
      if (isLocal(node) && hasNamespaceSpecifier(node)) {
        found.push({ line: lineOfNode(node) });
      }
    });
    return found;
  },
};
