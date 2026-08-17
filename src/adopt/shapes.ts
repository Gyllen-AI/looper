import type { Check, Finding, Subject } from "../law/engine.ts";
import type { Rule } from "../law/rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "../law/ts/parse.ts";
import { fieldAt } from "../fields.ts";

export type Shape = "banned-symbol" | "banned-import";

export type Adopted = {
  readonly shape: Shape;
  readonly what: string;
  readonly because: string;
  readonly instead: readonly string[];
  readonly evidence: readonly string[];
};

export function isShape(name: string): name is Shape {
  return name === "banned-symbol" || name === "banned-import";
}

function ruleFor(adopted: Adopted): Rule {
  const id = `PROJECT-${adopted.shape === "banned-symbol" ? "SYMBOL" : "IMPORT"}:${adopted.what}`;
  const bans =
    adopted.shape === "banned-symbol"
      ? `using \`${adopted.what}\``
      : `importing from \`${adopted.what}\``;

  return {
    id,
    category: "DEAD",
    pass: "fast",
    bans,
    why: `${adopted.because}. This is a rule this project adopted rather than one looper ships, and it was adopted only after every existing use of it was rewritten — so nothing here relies on it any more`,
    instead: adopted.instead,
    valve: {
      kind: "knob",
      key: ".looper/adopted.toml",
      note: "delete the entry to drop this rule; the evidence recorded with it is what justified adding it",
    },
  };
}

function usesSymbol(node: Node, name: string): boolean {
  if (node.type === "CallExpression") {
    const callee = node["callee"];
    if (callee === null || typeof callee !== "object") return false;
    if (fieldAt(callee, "type") !== "Identifier") {
      return false;
    }
    return fieldAt(callee, "name") === name;
  }
  if (node.type !== "MemberExpression") return false;
  const object = node["object"];
  if (fieldAt(object, "type") !== "Identifier") return false;
  return fieldAt(object, "name") === name;
}

function importsFrom(node: Node, specifier: string): boolean {
  if (node.type !== "ImportDeclaration") return false;
  const source = node["source"];
  const value = fieldAt(source, "value");
  return value === specifier;
}

export function checkFor(adopted: Adopted): Check {
  return {
    rule: ruleFor(adopted),

    run(subject: Subject): readonly Finding[] {
      const parsed = parseSource(subject.file, subject.text);
      if (parsed.kind === "unreadable") return [];

      const found: Finding[] = [];
      const seen = new Set<number>();
      walk(parsed.root, (node) => {
        const hit =
          adopted.shape === "banned-symbol"
            ? usesSymbol(node, adopted.what)
            : importsFrom(node, adopted.what);
        if (!hit) return;
        const line = lineOfNode(node);
        if (seen.has(line)) return;
        seen.add(line);
        found.push({ line });
      });
      return found;
    },
  };
}
