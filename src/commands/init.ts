import type { Out } from "../out.ts";
import { DEV, INJECTION_BUDGET, namedProject, projectRoot, searchPath, whereTheUserLives, type Invocation } from "../config.ts";
import { AFTER_INIT, USAGE, costLines, describeStep, mapComplaints } from "../announce.ts";
import { reachedFrom, runInit, type Report, type Step } from "../init.ts";
import { here } from "../session.ts";

function printReport(report: Report, out: Out): void {
  const lines = ["looper init:"];
  for (const step of report.steps) lines.push(...describeStep(step));
  lines.push(...AFTER_INIT);
  out.say(lines.join("\n"));
}

function invocationFrom(args: readonly string[]): Invocation {
  if (args.includes("--dev")) return DEV;
  return reachedFrom(here());
}

export function init(args: readonly string[], out: Out): number {
  printReport(runInit(here(), invocationFrom(args), searchPath()), out);
  return 0;
}
