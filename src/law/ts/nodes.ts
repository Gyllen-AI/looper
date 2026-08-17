import { walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export type Named =
  | { readonly kind: "unnamed" }
  | { readonly kind: "named"; readonly name: string };

const UNNAMED: Named = { kind: "unnamed" };

function identifierName(value: unknown): Named {
  if (value === null || typeof value !== "object") return UNNAMED;
  if (fieldAt(value, "type") !== "Identifier") {
    return UNNAMED;
  }
  const name = fieldAt(value, "name");
  return typeof name === "string" ? { kind: "named", name } : UNNAMED;
}

export function anyNode(root: Node, matches: (node: Node) => boolean): boolean {
  let found = false;
  walk(root, (node) => {
    if (matches(node)) found = true;
  });
  return found;
}

export function calledName(node: Node): Named {
  const callee = node["callee"];
  if (callee === null || typeof callee !== "object") return UNNAMED;
  const type = fieldAt(callee, "type");
  if (type === "Identifier") return identifierName(callee);
  if (type !== "MemberExpression") return UNNAMED;
  return identifierName(fieldAt(callee, "property"));
}

export function isCallTo(node: Node, wanted: readonly string[]): boolean {
  if (node.type !== "CallExpression") return false;
  const called = calledName(node);
  return called.kind === "named" && wanted.includes(called.name);
}
