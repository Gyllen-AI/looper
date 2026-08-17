import type { Rule, Violation } from "../rule.ts";
import { lineOfNode, parseSource, walk, type Node } from "../ts/parse.ts";
import { fieldAt } from "../../fields.ts";

export const CROSSED_BOUNDARY: Rule = {
  id: "TAURI:1",
  category: "TRUTH",
  pass: "fast",
  bans: "calling `invoke` with a name no `#[tauri::command]` answers to",
  why:
    "the two halves of a Tauri app meet at a string. One side writes `invoke(\"save_note\")` and the other writes `fn save_note`, and nothing checks that they still agree — not the Rust compiler, which never sees the string, and not TypeScript, which never sees the function. Rename one and the app builds, ships, and fails the first time somebody presses the button",
  instead: [
    "spell it the way the Rust side spells it: `#[tauri::command] fn save_note` is `invoke(\"save_note\")`",
    "if the command is gone, the call is dead and should go with it",
  ],
  valve: { kind: "none" },
};

const INVOKE = "invoke";

const TAURI_PACKAGE = "@tauri-apps/";

function importsInvokeFromTauri(root: Node): boolean {
  let found = false;
  walk(root, (node) => {
    if (node.type !== "ImportDeclaration") return;
    const from = fieldAt(node["source"], "value");
    if (typeof from !== "string" || !from.startsWith(TAURI_PACKAGE)) return;
    const specifiers = node["specifiers"];
    if (!Array.isArray(specifiers)) return;
    for (const held of specifiers) {
      if (fieldAt(fieldAt(held, "local"), "name") === INVOKE) found = true;
    }
  });
  return found;
}

export type Called = { readonly name: string; readonly line: number };

export function invokedIn(file: string, text: string): readonly Called[] {
  const parsed = parseSource(file, text);
  if (parsed.kind === "unreadable") return [];
  if (!importsInvokeFromTauri(parsed.root)) return [];

  const found: Called[] = [];
  walk(parsed.root, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = node["callee"];
    if (fieldAt(callee, "type") !== "Identifier") return;
    if (fieldAt(callee, "name") !== INVOKE) return;
    const args = node["arguments"];
    if (!Array.isArray(args)) return;
    const first = args[0];
    if (fieldAt(first, "type") !== "StringLiteral") return;
    const name = fieldAt(first, "value");
    if (typeof name === "string") found.push({ name, line: lineOfNode(node) });
  });
  return found;
}

export function crossingsIn(
  file: string,
  text: string,
  answered: ReadonlySet<string>,
): readonly Violation[] {
  const found: Violation[] = [];
  for (const call of invokedIn(file, text)) {
    if (answered.has(call.name)) continue;
    found.push({ rule: CROSSED_BOUNDARY, file, line: call.line });
  }
  return found;
}
