import type { Check } from "../src/law/engine.ts";
import type { Concessions } from "../src/law/concessions.ts";
import type { Case } from "./cases.ts";
import { reasonFrom } from "../src/fields.ts";

function verdictFor(
  held: Case,
  check: Check,
  concessions: Concessions,
): string {
  try {
    const named = held.file === undefined ? "a.ts" : held.file;
    const found = check.run({ file: named, text: held.code }, concessions);
    return found.length > 0 ? "fires" : "silent";
  } catch (cause) {
    return `threw: ${reasonFrom(cause)}`;
  }
}

export function disagreements(
  cases: readonly Case[],
  checks: readonly Check[],
  concessions: Concessions,
): readonly string[] {
  const said: string[] = [];
  for (const held of cases) {
    const check = checks.find((one) => one.rule.id === held.rule);
    if (check === undefined) {
      said.push(`${held.rule} is named by a case and is not a rule`);
      continue;
    }
    const got = verdictFor(held, check, concessions);
    if (got === held.expect) continue;
    said.push(`${held.rule.padEnd(20)} ${held.name}  (wanted ${held.expect}, got ${got})`);
  }
  return said;
}
