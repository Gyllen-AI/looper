import { isNode, parseSource, walk, type Node } from "../law/ts/parse.ts";

const STRUCTURAL: readonly string[] = [
  "type",
  "operator",
  "kind",
  "async",
  "generator",
  "computed",
  "static",
  "optional",
  "prefix",
];

const NAMED: readonly string[] = ["Identifier", "JSXIdentifier", "TSTypeReference"];

const LITERAL = /Literal$/;

export type Shape = {
  readonly node: string;
  readonly detail: readonly string[];
  readonly children: readonly Shape[];
};

export type Anonymiser = {
  nameFor(original: string): string;
};

export function anonymiser(): Anonymiser {
  const seen = new Map<string, string>();
  return {
    nameFor(original: string): string {
      const held = seen.get(original);
      if (held !== undefined) return held;
      const given = `name${seen.size + 1}`;
      seen.set(original, given);
      return given;
    },
  };
}

function detailsOf(node: Node, names: Anonymiser): readonly string[] {
  const detail: string[] = [];
  for (const key of STRUCTURAL) {
    if (key === "type") continue;
    const held = node[key];
    if (typeof held === "string") detail.push(`${key}=${held}`);
    if (held === true) detail.push(key);
  }
  if (NAMED.includes(node.type)) {
    const name = node["name"];
    if (typeof name === "string") detail.push(names.nameFor(name));
  }
  if (LITERAL.test(node.type)) detail.push("value-removed");
  return detail;
}

export function shapeOf(node: Node, names: Anonymiser, depth: number): Shape {
  const children: Shape[] = [];
  if (depth > 0) {
    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const held = node[key];
      if (Array.isArray(held)) {
        for (const one of held) {
          if (isNode(one)) children.push(shapeOf(one, names, depth - 1));
        }
        continue;
      }
      if (isNode(held)) children.push(shapeOf(held, names, depth - 1));
    }
  }
  return { node: node.type, detail: detailsOf(node, names), children };
}

export function render(shape: Shape, indent: number): string {
  const pad = "  ".repeat(indent);
  const detail = shape.detail.length === 0 ? "" : ` (${shape.detail.join(", ")})`;
  return [
    `${pad}${shape.node}${detail}`,
    ...shape.children.map((child) => render(child, indent + 1)),
  ].join("\n");
}

export type Located =
  | { readonly kind: "not-found"; readonly why: string }
  | { readonly kind: "found"; readonly shape: Shape };

const ENCLOSING: readonly string[] = [
  "ExpressionStatement",
  "VariableDeclaration",
  "ReturnStatement",
  "ThrowStatement",
  "CatchClause",
  "IfStatement",
  "FunctionDeclaration",
  "ClassMethod",
  "ImportDeclaration",
  "ExportNamedDeclaration",
];

export function shapeAt(file: string, text: string, line: number, depth: number): Located {
  const parsed = parseSource(file, text);
  if (parsed.kind === "unreadable") {
    return { kind: "not-found", why: "the file could not be read as TypeScript" };
  }

  let smallest: Node | null = null;
  walk(parsed.root, (node) => {
    if (!ENCLOSING.includes(node.type)) return;
    if (node.loc === null || node.loc.start.line !== line) return;
    smallest = node;
  });

  if (smallest === null) {
    return { kind: "not-found", why: `nothing looked like a statement on line ${line}` };
  }
  return { kind: "found", shape: shapeOf(smallest, anonymiser(), depth) };
}
