import { parse } from "@babel/parser";
import { readFileSync } from "node:fs";
import { reasonFrom } from "../src/fields.ts";
import { execSync } from "node:child_process";
import { CASES } from "./cases.ts";

function seen(text: string, tsx: boolean, into: Set<string>): void {
  const plugins = tsx ? ["typescript", "jsx", "decorators"] : ["typescript", "decorators"];
  let ast;
  try {
    ast = parse(text, { sourceType: "module", plugins, errorRecovery: true });
  } catch (cause) {
    into.add(`unparseable: ${reasonFrom(cause)}`);
    return;
  }
  const walk = (n: unknown): void => {
    if (n === null || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const c of n) walk(c); return; }
    const t = Object.getOwnPropertyDescriptor(n, "type")?.value;
    if (typeof t === "string") into.add(t);
    for (const k of Object.keys(n)) { if (k !== "loc") walk(Object.getOwnPropertyDescriptor(n, k)?.value); }
  };
  walk(ast.program);
}

export function unproduced(): readonly string[] {
    const real = new Set<string>();
  for (const f of execSync("find src tests audit -name '*.ts'", { encoding: "utf8" }).trim().split("\n")) {
    seen(readFileSync(f, "utf8"), false, real);
  }
  for (const c of CASES) seen(c.code, c.file !== undefined && c.file.endsWith("x"), real);

  const ASKS_A_TYPE = /(?:\.type|fieldAt\([^)]*,\s*"type"\)|\["type"\])\s*(?:===|!==)\s*"([A-Za-z]+)"|"([A-Za-z]+)"\s*(?:===|!==)\s*(?:[a-zA-Z]+\.type|fieldAt\([^)]*,\s*"type"\))/g;
  const NAMED_TYPES = /(?:includes|some)\(\s*(?:node|held|value)\.type\s*\)/;

  const used = new Set<string>();
  for (const f of execSync("find src/law -name '*.ts'", { encoding: "utf8" }).trim().split("\n")) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(ASKS_A_TYPE)) {
      const named = m[1] === undefined ? m[2] : m[1];
      if (named !== undefined) used.add(named);
    }
    if (!NAMED_TYPES.test(text)) continue;
    for (const m of text.matchAll(/readonly string\[\] = \[([^\]]*)\]/g)) {
      const body = m[1];
      if (body === undefined) continue;
      for (const one of body.matchAll(/"([A-Z][A-Za-z]+)"/g)) {
        if (one[1] !== undefined) used.add(one[1]);
      }
    }
  }
    return [...used].filter((n) => /^[A-Z]/.test(n) && !real.has(n)).sort();
  }
