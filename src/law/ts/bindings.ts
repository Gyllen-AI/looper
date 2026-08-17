import { walk, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export type Bindings = ReadonlyMap<string, readonly unknown[]>;

const HOPS = 3;

function record(into: Map<string, unknown[]>, name: unknown, value: unknown): void {
  if (typeof name !== "string" || value === null || value === undefined) return;
  const held = into.get(name);
  if (held === undefined) {
    into.set(name, [value]);
    return;
  }
  held.push(value);
}

export function valuesBoundIn(root: unknown): Bindings {
  const found = new Map<string, unknown[]>();
  if (root === null || typeof root !== "object") return found;
  walk(root, (node) => {
    if (node.type === "VariableDeclarator") {
      record(found, fieldAt(node["id"], "name"), node["init"]);
      return;
    }
    if (node.type !== "AssignmentExpression") return;
    const left = node["left"];
    if (fieldAt(left, "type") !== "Identifier") return;
    record(found, fieldAt(left, "name"), node["right"]);
  });
  return found;
}

export function tracedFrom(value: unknown, bindings: Bindings): readonly unknown[] {
  const reached: unknown[] = [];
  const seen = new Set<string>();
  let edge: unknown[] = [value];

  for (let hop = 0; hop <= HOPS; hop += 1) {
    const next: unknown[] = [];
    for (const held of edge) {
      reached.push(held);
      if (fieldAt(held, "type") !== "Identifier") continue;
      const name = fieldAt(held, "name");
      if (typeof name !== "string" || seen.has(name)) continue;
      seen.add(name);
      const bound = bindings.get(name);
      if (bound !== undefined) next.push(...bound);
    }
    if (next.length === 0) return reached;
    edge = next;
  }
  return reached;
}

export function anyTraced(
  value: unknown,
  bindings: Bindings,
  test: (held: unknown) => boolean,
): boolean {
  return tracedFrom(value, bindings).some(test);
}

export type { Node };
