import type { Check, Finding, Subject } from "../engine.ts";
import type { Rule } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "../ts/parse.ts";
import { fieldAt } from "../../fields.ts";

export const LYING_DEPENDENCIES: Rule = {
  id: "REACT:2",
  category: "TRUTH",
  pass: "fast",
  bans: "an effect whose list of what it depends on leaves something out",
  why:
    "the list is a promise that nothing else can change the answer. React believes it, so when the thing you left out changes, the effect does not run again and the screen quietly keeps showing what was true a minute ago. Nothing errors, nothing looks broken, and the number on the page is simply wrong",
  instead: [
    "list everything the effect reads: useEffect(() => { load(userId) }, [userId])",
    "if listing it causes a loop, the fix is what the effect does, not a shorter list",
  ],
  valve: { kind: "none" },
};

const WATCHING: readonly string[] = ["useEffect", "useLayoutEffect", "useMemo", "useCallback"];

const HOLDS_A_FUNCTION: readonly string[] = [
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
];

function watcherName(node: Node): string | null {
  if (node.type !== "CallExpression") return null;
  const callee = node["callee"];
  if (fieldAt(callee, "type") !== "Identifier") return null;
  const name = fieldAt(callee, "name");
  return typeof name === "string" && WATCHING.includes(name) ? name : null;
}

function skipped(node: unknown, key: string): boolean {
  const type = fieldAt(node, "type");
  if (type === "MemberExpression" || type === "OptionalMemberExpression") {
    return key === "property" && fieldAt(node, "computed") !== true;
  }
  if (type === "ObjectProperty" || type === "ObjectMethod") {
    return key === "key" && fieldAt(node, "computed") !== true;
  }
  return false;
}

function gather(node: unknown, into: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const held of node) gather(held, into);
    return;
  }
  if (fieldAt(node, "type") === "Identifier") {
    const name = fieldAt(node, "name");
    if (typeof name === "string") into.add(name);
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || skipped(node, key)) continue;
    gather(fieldAt(node, key), into);
  }
}

function namesIn(node: unknown): ReadonlySet<string> {
  const found = new Set<string>();
  gather(node, found);
  return found;
}

function declaredWithin(body: unknown): ReadonlySet<string> {
  const found = new Set<string>();
  if (body === null || typeof body !== "object") return found;
  walk(body, (held) => {
    if (held.type === "VariableDeclarator") {
      gather(held["id"], found);
      return;
    }
    if (!HOLDS_A_FUNCTION.includes(held.type)) return;
    gather(held["id"], found);
    gather(held["params"], found);
  });
  return found;
}

const STABLE_PAIR: readonly string[] = ["useState", "useReducer"];

const STABLE_WHOLE: readonly string[] = ["useRef"];

function calledHook(value: unknown): string | null {
  if (fieldAt(value, "type") !== "CallExpression") return null;
  const callee = fieldAt(value, "callee");
  if (fieldAt(callee, "type") !== "Identifier") return null;
  const name = fieldAt(callee, "name");
  return typeof name === "string" ? name : null;
}

function stableNames(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(root, (node) => {
    if (node.type !== "VariableDeclarator") return;
    const from = calledHook(node["init"]);
    if (from === null) return;
    if (STABLE_WHOLE.includes(from)) {
      gather(node["id"], found);
      return;
    }
    if (!STABLE_PAIR.includes(from)) return;
    const id = node["id"];
    if (fieldAt(id, "type") !== "ArrayPattern") return;
    const elements = fieldAt(id, "elements");
    if (!Array.isArray(elements)) return;
    gather(elements[1], found);
  });
  return found;
}

function boundInThisFile(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(root, (node) => {
    if (node.type === "VariableDeclarator") {
      gather(node["id"], found);
      return;
    }
    if (!HOLDS_A_FUNCTION.includes(node.type)) return;
    gather(node["params"], found);
  });
  return found;
}

function declaredAtModuleScope(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  const body = root["body"];
  if (!Array.isArray(body)) return found;
  for (const statement of body) {
    const exported = fieldAt(statement, "type") === "ExportNamedDeclaration";
    const held = exported ? fieldAt(statement, "declaration") : statement;
    if (fieldAt(held, "type") !== "VariableDeclaration") continue;
    if (fieldAt(held, "kind") !== "const") continue;
    const declarations = fieldAt(held, "declarations");
    if (!Array.isArray(declarations)) continue;
    for (const one of declarations) gather(fieldAt(one, "id"), found);
  }
  return found;
}

function boundInsideAFunction(root: Node): ReadonlySet<string> {
  const found = new Set<string>();
  walk(root, (node) => {
    if (!HOLDS_A_FUNCTION.includes(node.type)) return;
    for (const name of declaredWithin(node)) found.add(name);
  });
  return found;
}

function madeOnceForTheWholeFile(root: Node): ReadonlySet<string> {
  const inside = boundInsideAFunction(root);
  const found = new Set<string>();
  for (const name of declaredAtModuleScope(root)) {
    if (inside.has(name)) continue;
    found.add(name);
  }
  return found;
}

export const lyingDependenciesCheck: Check = {
  rule: LYING_DEPENDENCIES,

  run(subject: Subject): readonly Finding[] {
    const parsed = parseSource(subject.file, subject.text);
    if (parsed.kind === "unreadable") return [];

    const bound = boundInThisFile(parsed.root);
    const stable = stableNames(parsed.root);
    const madeOnce = madeOnceForTheWholeFile(parsed.root);
    const found: Finding[] = [];

    walk(parsed.root, (node) => {
      if (watcherName(node) === null) return;
      const args = node["arguments"];
      if (!Array.isArray(args) || args.length < 2) return;

      const listed = namesIn(args[1]);
      const inner = declaredWithin(args[0]);
      const parameters = namesIn(fieldAt(args[0], "params"));

      for (const used of namesIn(args[0])) {
        if (listed.has(used) || inner.has(used) || parameters.has(used)) continue;
        if (stable.has(used) || madeOnce.has(used)) continue;
        if (!bound.has(used)) continue;
        found.push({ line: lineOfNode(node) });
        return;
      }
    });

    return found;
  },
};
