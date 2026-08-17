import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const NOTHING_RETURNED: Rule = {
  id: "TS-TYPE:2",
  category: "TYPE",
  pass: "fast",
  bans: "an exported function whose written return type includes `null` or `undefined`",
  why:
    "whoever calls it cannot tell the three cases apart: there was no such thing, there was one and it was empty, or the lookup never happened. So they guess, and they guess whichever way makes their code shorter. Absence needs a name before it can be handled",
  instead: [
    "throw when absence is a failure: if (row === undefined) throw new NotFound(id)",
    "name both cases when both are real answers: { kind: 'found', user } | { kind: 'none' }",
    "keep it private — this rule is about what you promise other files, not how you work inside one",
  ],
  valve: { kind: "none" },
};

const NOTHING: readonly string[] = ["TSNullKeyword", "TSUndefinedKeyword"];

const CARRIES_ITS_ANSWER = "Promise";

type Aliases = ReadonlyMap<string, unknown>;

function referenceName(value: unknown): string | null {
  if (fieldAt(value, "type") !== "TSTypeReference") return null;
  const name = fieldAt(fieldAt(value, "typeName"), "name");
  return typeof name === "string" ? name : null;
}

function firstArgumentOf(value: unknown): unknown {
  for (const field of ["typeArguments", "typeParameters"]) {
    const parameters = fieldAt(fieldAt(value, field), "params");
    if (Array.isArray(parameters)) return parameters[0];
  }
  return null;
}

function promisesNothing(value: unknown, aliases: Aliases, seen: ReadonlySet<string>): boolean {
  const type = fieldAt(value, "type");
  if (typeof type !== "string") return false;
  if (NOTHING.includes(type)) return true;
  if (type === "TSTypeAnnotation") {
    return promisesNothing(fieldAt(value, "typeAnnotation"), aliases, seen);
  }
  if (type === "TSUnionType" || type === "TSIntersectionType") {
    const members = fieldAt(value, "types");
    if (!Array.isArray(members)) return false;
    return members.some((held) => promisesNothing(held, aliases, seen));
  }
  const named = referenceName(value);
  if (named === null) return false;
  if (named === CARRIES_ITS_ANSWER) {
    return promisesNothing(firstArgumentOf(value), aliases, seen);
  }
  if (seen.has(named) || !aliases.has(named)) return false;
  return promisesNothing(aliases.get(named), aliases, new Set([...seen, named]));
}

function aliasesIn(root: Node): Aliases {
  const found = new Map<string, unknown>();
  walk(root, (node) => {
    if (node.type !== "TSTypeAliasDeclaration") return;
    const name = fieldAt(node["id"], "name");
    if (typeof name === "string") found.set(name, node["typeAnnotation"]);
  });
  return found;
}

function declared(node: Node): Node | null {
  const held = node["declaration"];
  if (held === null || typeof held !== "object") return null;
  return held;
}

function returnTypeOf(node: Node): unknown {
  const kind = node.type;
  if (kind === "FunctionDeclaration" || kind === "FunctionExpression") return node["returnType"];
  if (kind === "TSDeclareFunction") return node["returnType"];
  if (kind === "ArrowFunctionExpression") return node["returnType"];
  if (kind !== "VariableDeclaration") return null;
  const declarations = node["declarations"];
  if (!Array.isArray(declarations)) return null;
  for (const one of declarations) {
    const init = fieldAt(one, "init");
    const shape = fieldAt(init, "type");
    if (shape !== "ArrowFunctionExpression" && shape !== "FunctionExpression") continue;
    return fieldAt(init, "returnType");
  }
  return null;
}

export const nothingReturnedCheck: Check = {
  rule: NOTHING_RETURNED,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const aliases = aliasesIn(parsed.root);
    const nothing = new Set<string>();
    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      const exported =
        node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration";
      if (!exported) return;
      const inner = declared(node);
      if (inner === null) return;
      if (promisesNothing(returnTypeOf(inner), aliases, nothing)) {
        found.push({ line: lineOfNode(inner) });
      }
    });
    return found;
  },
};
