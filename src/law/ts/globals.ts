import { walk, isNode, type Node } from "./parse.ts";
import { fieldAt } from "../../fields.ts";

export type Reach = {
  readonly aliases: ReadonlyMap<string, readonly string[]>;
  readonly local: ReadonlySet<string>;
};

const GLOBAL_OBJECT = "globalThis";

function named(value: unknown): string | null {
  const name = fieldAt(value, "name");
  return typeof name === "string" ? name : null;
}

function stepOf(node: Node): string | null {
  const property = node["property"];
  if (fieldAt(node, "computed") !== true) return named(property);
  const value = fieldAt(property, "value");
  return typeof value === "string" ? value : null;
}

function bareChain(value: unknown): readonly string[] | null {
  const type = fieldAt(value, "type");
  if (type === "MetaProperty") return ["import", "meta"];
  if (type === "Identifier") {
    const name = named(value);
    return name === null ? null : [name];
  }
  if (type !== "MemberExpression" && type !== "OptionalMemberExpression") return null;
  if (!isNode(value)) return null;
  const base = bareChain(value["object"]);
  const step = stepOf(value);
  if (base === null || step === null) return null;
  return [...base, step];
}

function boundNames(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(root, (node) => {
    if (node.type === "VariableDeclarator") {
      collect(node["id"], found);
      return;
    }
    if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      collect(node["id"], found);
    }
    if (node.type === "ImportSpecifier" || node.type === "ImportDefaultSpecifier") {
      collect(node["local"], found);
      return;
    }
    if (node["params"] !== undefined) collect(node["params"], found);
    if (node.type === "CatchClause") collect(node["param"], found);
  });
  return found;
}

function collect(value: unknown, into: Set<string>): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const held of value) collect(held, into);
    return;
  }
  const name = fieldAt(value, "name");
  if (fieldAt(value, "type") === "Identifier" && typeof name === "string") {
    into.add(name);
    return;
  }
  for (const key of Object.keys(value)) {
    if (key === "loc") continue;
    collect(fieldAt(value, key), into);
  }
}

function withoutGlobalThis(path: readonly string[]): readonly string[] {
  return path[0] === GLOBAL_OBJECT ? path.slice(1) : path;
}

function aliasesIn(root: Node): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  walk(root, (node) => {
    if (node.type !== "VariableDeclarator") return;
    const chain = bareChain(node["init"]);
    if (chain === null) return;
    const path = withoutGlobalThis(chain);

    const id = node["id"];
    const direct = named(id);
    if (direct !== null) {
      found.set(direct, path);
      return;
    }
    if (fieldAt(id, "type") !== "ObjectPattern") return;
    const properties = fieldAt(id, "properties");
    if (!Array.isArray(properties)) return;
    for (const held of properties) {
      const key = named(fieldAt(held, "key"));
      const local = named(fieldAt(held, "value"));
      if (key === null || local === null) continue;
      found.set(local, [...path, key]);
    }
  });
  return found;
}

export function reachIn(root: Node): Reach {
  return { aliases: aliasesIn(root), local: boundNames(root) };
}

function globalPathOf(value: unknown, reach: Reach): readonly string[] | null {
  const chain = bareChain(value);
  if (chain === null) return null;
  const head = chain[0];
  if (head === undefined) return null;

  if (head === GLOBAL_OBJECT) return chain.slice(1);

  const alias = reach.aliases.get(head);
  if (alias !== undefined) return [...alias, ...chain.slice(1)];
  if (reach.local.has(head)) return null;
  return chain;
}

export function reaches(
  value: unknown,
  reach: Reach,
  wanted: readonly string[],
): boolean {
  const path = globalPathOf(value, reach);
  if (path === null || path.length < wanted.length) return false;
  return wanted.every((step, at) => path[at] === step);
}
