import { extname } from "node:path";

import { isNode, parseSource, walk, type Node } from "../law/ts/parse.ts";
import { shapeFromRust, type Shaped } from "../law/rust/drive.ts";
import { shapeFromPython } from "../law/python/drive.ts";
import { fieldAt } from "../fields.ts";

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

const GRAMMAR: readonly string[] = [
  "const", "let", "var", "init", "get", "set", "method", "constructor", "value",
  "public", "private", "protected", "readonly", "abstract", "declare", "in",
  "out", "typeof", "keyof", "unique", "asserts", "infer", "instanceof", "void",
  "delete", "await", "yield", "new", "this", "super", "null", "undefined",
];

const PUNCTUATION = /^[^A-Za-z0-9_$]+$/;

function sayableValue(held: string): string {
  if (PUNCTUATION.test(held)) return held;
  if (GRAMMAR.includes(held)) return held;
  return "removed";
}

const RUST_GRAMMAR: readonly string[] = [
  "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum", "extern",
  "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref",
  "return", "self", "Self", "static", "struct", "trait", "type", "union", "unsafe", "use", "where",
  "while", "u8", "u16", "u32", "u64", "u128", "usize", "i8", "i16", "i32", "i64", "i128", "isize",
  "f32", "f64", "bool", "char", "str", "parens", "braces", "brackets", "none",
];

const PYTHON_NODES: readonly string[] = [
  "alias", "arg", "arguments", "boolop", "cmpop", "comprehension", "excepthandler", "expr",
  "expr_context", "keyword", "match_case", "mod", "operator", "pattern", "slice", "stmt",
  "type_ignore", "type_param", "unaryop", "withitem",
];

const PYTHON_GRAMMAR: readonly string[] = [
  "and", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else",
  "except", "finally", "for", "from", "global", "import", "lambda", "nonlocal", "not", "raise",
  "return", "try", "while", "with", "yield",
];

export const SKELETON_WORDS: readonly string[] = [
  ...STRUCTURAL,
  ...GRAMMAR,
  ...NAMED,
  ...RUST_GRAMMAR,
  ...PYTHON_GRAMMAR,
  ...PYTHON_NODES,
];

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
    if (typeof held === "string") detail.push(`${key}=${sayableValue(held)}`);
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
  | { readonly kind: "found"; readonly shape: Shape }
  | { readonly kind: "around"; readonly shape: Shape; readonly startsAt: number };

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

type Span = { readonly node: Node; readonly from: number; readonly to: number };

function spanOf(node: Node): Span | null {
  if (node.loc === null) return null;
  const ending = fieldAt(fieldAt(node["loc"], "end"), "line");
  if (typeof ending !== "number") return null;
  return { node, from: node.loc.start.line, to: ending };
}

function outermostStartingOn(root: Node, line: number): Span | null {
  let held: Span | null = null;
  walk(root, (node) => {
    if (held !== null) return;
    if (!ENCLOSING.includes(node.type)) return;
    const span = spanOf(node);
    if (span === null || span.from !== line) return;
    held = span;
  });
  return held;
}

function smallestAround(root: Node, line: number): Span | null {
  let held: Span | null = null;
  walk(root, (node) => {
    if (!ENCLOSING.includes(node.type)) return;
    const span = spanOf(node);
    if (span === null) return;
    if (span.from > line || span.to < line) return;
    if (held !== null && span.to - span.from > held.to - held.from) return;
    held = span;
  });
  return held;
}

export function shapeAt(file: string, text: string, line: number, depth: number): Located {
  const parsed = parseSource(file, text);
  if (parsed.kind === "unreadable") {
    return { kind: "not-found", why: "the file could not be read as TypeScript" };
  }

  const outermost = outermostStartingOn(parsed.root, line);
  if (outermost !== null) {
    return { kind: "found", shape: shapeOf(outermost.node, anonymiser(), depth) };
  }

  const around = smallestAround(parsed.root, line);
  if (around === null) {
    return { kind: "not-found", why: `nothing looked like a statement on line ${line}` };
  }
  return {
    kind: "around",
    shape: shapeOf(around.node, anonymiser(), depth),
    startsAt: around.from,
  };
}

function shapeFrom(payload: unknown): Located {
  const refused = fieldAt(payload, "error");
  if (typeof refused === "string") return { kind: "not-found", why: refused };
  const built = builtShape(fieldAt(payload, "shape"));
  if (built === null) return { kind: "not-found", why: "the reader did not answer with a shape" };
  const startsAt = fieldAt(payload, "startsAt");
  if (typeof startsAt === "number") return { kind: "around", shape: built, startsAt };
  return { kind: "found", shape: built };
}

function builtShape(held: unknown): Shape | null {
  const node = fieldAt(held, "node");
  if (typeof node !== "string") return null;
  const detail = fieldAt(held, "detail");
  const children = fieldAt(held, "children");
  const said: string[] = Array.isArray(detail)
    ? detail.filter((one): one is string => typeof one === "string")
    : [];
  const below: Shape[] = [];
  if (Array.isArray(children)) {
    for (const one of children) {
      const child = builtShape(one);
      if (child !== null) below.push(child);
    }
  }
  return { node, detail: said, children: below };
}

function readBy(said: Shaped): Located {
  if (said.kind === "unavailable") return { kind: "not-found", why: said.detail };
  return shapeFrom(said.payload);
}

export function shapeFor(
  looperRoot: string,
  path: string,
  source: string,
  line: number,
  depth: number,
): Located {
  const ending = extname(path);
  if (ending === ".rs") return readBy(shapeFromRust(looperRoot, path, line, depth));
  if (ending === ".py") return readBy(shapeFromPython(looperRoot, path, line, depth));
  return shapeAt(path, source, line, depth);
}
