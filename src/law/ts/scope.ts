import { walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export type Bindings = {
  readonly imported: ReadonlySet<string>;
  readonly declared: ReadonlySet<string>;
};

const DECLARING: readonly string[] = [
  "VariableDeclarator",
  "FunctionDeclaration",
  "ClassDeclaration",
  "TSEnumDeclaration",
];

function nameOf(value: unknown): string | null {
  const type = fieldAt(value, "type");
  if (type !== "Identifier") return null;
  const name = fieldAt(value, "name");
  return typeof name === "string" ? name : null;
}

export function bindingsIn(root: Node): Bindings {
  const imported = new Set<string>();
  const declared = new Set<string>();

  walk(root, (node) => {
    if (node.type === "ImportDeclaration") {
      const specifiers = node["specifiers"];
      if (!Array.isArray(specifiers)) return;
      for (const specifier of specifiers) {
        if (specifier === null || typeof specifier !== "object") continue;
        const local = fieldAt(specifier, "local");
        const name = nameOf(local);
        if (name !== null) imported.add(name);
      }
      return;
    }
    if (!DECLARING.includes(node.type)) return;
    const name = nameOf(node["id"]);
    if (name !== null) declared.add(name);
  });

  return { imported, declared };
}

export type Provenance =
  | { readonly kind: "genuine" }
  | { readonly kind: "shadowed" }
  | { readonly kind: "absent" };

export function provenanceOf(bindings: Bindings, root: string): Provenance {
  if (bindings.declared.has(root)) return { kind: "shadowed" };
  if (bindings.imported.has(root)) return { kind: "genuine" };
  return { kind: "absent" };
}

export type MemberName =
  | { readonly kind: "not-a-member-call" }
  | { readonly kind: "not-plain-names" }
  | { readonly kind: "named"; readonly symbol: string };

export function rootOfMember(node: Node): MemberName {
  const callee = node["callee"];
  if (callee === null || typeof callee !== "object") {
    return { kind: "not-a-member-call" };
  }
  const type = fieldAt(callee, "type");
  if (type !== "MemberExpression") return { kind: "not-a-member-call" };

  const object = fieldAt(callee, "object");
  const property = fieldAt(callee, "property");
  const objectName = nameOf(object);
  const propertyName = nameOf(property);
  if (objectName === null || propertyName === null) {
    return { kind: "not-plain-names" };
  }
  return { kind: "named", symbol: `${objectName}.${propertyName}` };
}
