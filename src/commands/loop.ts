import type { Out } from "../out.ts";
import { here } from "../session.ts";
import { whereTheUserLives } from "../config.ts";
import { LOOP_FILE, declaredIn } from "../loop/checks.ts";
import { keep } from "../loop/cache.ts";
import { ask, tallyOf, type Seen } from "../loop/run.ts";

const PATIENCE_SECONDS = 30;

function wanted(argv: readonly string[], flag: string): boolean {
  for (const one of argv) if (one === flag) return true;
  return false;
}

function line(seen: Seen): string {
  const shown = seen.verdict === "ok" ? "ok" : seen.verdict === "blind" ? "blind" : "BROKEN";
  return `  ${shown.padEnd(7)} ${seen.label.padEnd(26)} ${seen.detail}`;
}

export function loop(argv: readonly string[], out: Out): number {
  const terse = wanted(argv, "--terse");
  const root = here();
  const declared = declaredIn(root);
  for (const complaint of declared.complaints) out.warn(`${LOOP_FILE}: ${complaint}`);

  if (declared.checks.length === 0) {
    if (!terse) {
      out.say(`no checks declared. Write ${LOOP_FILE}, one section per check:`);
      out.say(``);
      out.say(`  [loop.build.workspace]`);
      out.say(`  reach = "internal"`);
      out.say(`  run = "cargo check --workspace -q"`);
      out.say(``);
      out.say(`The section name is the label, so a label cannot be written twice.`);
      out.say(`Exit 0 is ok, exit 3 on an external check is blind, anything else is broken.`);
    }
    return 0;
  }

  const seen: Seen[] = [];
  for (const check of declared.checks) seen.push(ask(check, root, PATIENCE_SECONDS));
  const tally = tallyOf(seen);
  keep(root, whereTheUserLives(), {
    at: new Date().toISOString(),
    ok: tally.ok,
    broken: tally.broken,
    blind: tally.blind,
    failing: tally.failing,
  });

  if (terse) {
    if (tally.broken === 0 && tally.blind === 0) return 0;
    out.say(`loop ok=${tally.ok} broken=${tally.broken} blind=${tally.blind}: ${tally.failing.join(" ")}`);
    return 0;
  }

  for (const one of seen) out.say(line(one));
  out.say(``);
  if (tally.broken === 0 && tally.blind === 0) {
    out.say(`the loop is whole: ok=${tally.ok} broken=0 blind=0`);
    return 0;
  }
  out.say(`ok=${tally.ok} broken=${tally.broken} blind=${tally.blind}`);
  out.say(`blind is not ok: a layer that could not be asked cannot be called healthy.`);
  return 0;
}
