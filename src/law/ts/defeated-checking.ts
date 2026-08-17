import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export const DEFEATED_CHECKING: Rule = {
  id: "TS-TYPE:3",
  category: "TYPE",
  pass: "fast",
  bans: "`as any`, `as unknown as T`, `<T>value`, and the `!` that says a value is definitely there",
  why:
    "each of these tells the compiler to stop checking and trust you. The check was the only thing standing between a wrong assumption and a crash in front of someone using the thing, and it costs nothing to keep",
  instead: [
    "const user = UserSchema.parse(input)",
    "if (row === undefined) throw new NotFound(id)",
    "function isUser(value: unknown): value is User { return ... }",
    "const config = { port: 8080 } satisfies Config",
  ],
  valve: { kind: "none" },
};

const CONST_ASSERTION = "const";

function isAnyKeyword(value: unknown): boolean {
  return fieldAt(value, "type") === "TSAnyKeyword";
}

function isConstAssertion(annotation: unknown): boolean {
  const type = fieldAt(annotation, "type");
  if (type !== "TSTypeReference") return false;
  const name = fieldAt(annotation, "typeName");
  return fieldAt(name, "name") === CONST_ASSERTION;
}

function isUnknownAssertion(expression: unknown): boolean {
  const type = fieldAt(expression, "type");
  if (type !== "TSAsExpression") return false;
  const annotation = fieldAt(expression, "typeAnnotation");
  if (annotation === null || typeof annotation !== "object") return false;
  return (
    fieldAt(annotation, "type") === "TSUnknownKeyword"
  );
}

function offends(node: Node): boolean {
  if (node.type === "TSNonNullExpression") return true;
  if (node.type === "TSTypeAssertion") return true;
  if (node.type !== "TSAsExpression") return false;

  const annotation = node["typeAnnotation"];
  if (isConstAssertion(annotation)) return false;
  if (isAnyKeyword(annotation)) return true;
  return isUnknownAssertion(node["expression"]);
}

export const defeatedCheckingCheck: Check = {
  rule: DEFEATED_CHECKING,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const found: Finding[] = [];
    walk(parsed.root, (node) => {
      if (offends(node)) found.push({ line: lineOfNode(node) });
    });
    return found;
  },
};
