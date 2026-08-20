import type { Reached } from "./stream.ts";

export type Fingerprint = {
  readonly shape: string;
  readonly times: number;
  readonly minutes: number;
  readonly means: string;
};

const A_WINDOW_MINUTES = 40;

const REPEATED_ENOUGH = 4;

const A_LONG_READ_RUN = 8;

const RE_READING_AT_MOST = 2;

const MINUTE = 60 * 1000;

const WRITING: readonly string[] = ["Edit", "MultiEdit", "Write", "NotebookEdit"];

function within(reached: readonly Reached[], now: number): readonly Reached[] {
  return reached.filter((one) => now - one.at <= A_WINDOW_MINUTES * MINUTE);
}

function spanOf(held: readonly Reached[]): number {
  if (held.length < 2) return 0;
  const first = held[0];
  const last = held[held.length - 1];
  if (first === undefined || last === undefined) return 0;
  return Math.max(1, Math.round((last.at - first.at) / MINUTE));
}

function repeatedShapes(held: readonly Reached[], tool: string, means: string): readonly Fingerprint[] {
  const grouped = new Map<string, Reached[]>();
  for (const one of held) {
    if (one.tool !== tool) continue;
    const kept = grouped.get(one.shape);
    if (kept === undefined) grouped.set(one.shape, [one]);
    else kept.push(one);
  }
  const found: Fingerprint[] = [];
  for (const [shape, ones] of grouped) {
    if (ones.length < REPEATED_ENOUGH) continue;
    found.push({ shape, times: ones.length, minutes: spanOf(ones), means });
  }
  return found;
}

function longReadRun(held: readonly Reached[]): readonly Fingerprint[] {
  let run: Reached[] = [];
  let longest: Reached[] = [];
  for (const one of held) {
    if (WRITING.includes(one.tool)) {
      if (run.length > longest.length) longest = run;
      run = [];
      continue;
    }
    run.push(one);
  }
  if (run.length > longest.length) longest = run;
  if (longest.length < A_LONG_READ_RUN) return [];
  const targets = new Set(longest.map((one) => one.shape));
  if (targets.size > RE_READING_AT_MOST) return [];
  return [
    {
      shape: `${longest.length} reads of the same ${targets.size} thing(s) with no write between them`,
      times: longest.length,
      minutes: spanOf(longest),
      means: "re-reading instead of acting on what was read",
    },
  ];
}

const REWRITTEN_WITHIN_MINUTES = 5;

function rewrittenSoon(held: readonly Reached[]): readonly Fingerprint[] {
  const written = held.filter((one) => WRITING.includes(one.tool));
  const found: Fingerprint[] = [];
  const seen = new Set<string>();
  for (let at = 0; at < written.length; at += 1) {
    const one = written[at];
    if (one === undefined || seen.has(one.shape)) continue;
    const again = written.filter(
      (other) => other.shape === one.shape && other.at - one.at <= REWRITTEN_WITHIN_MINUTES * MINUTE,
    );
    if (again.length < 2) continue;
    seen.add(one.shape);
    found.push({
      shape: one.shape,
      times: again.length,
      minutes: spanOf(again),
      means: "acting on a guess, because looking was too expensive",
    });
  }
  return found;
}

export function stallsIn(reached: readonly Reached[], now: number): readonly Fingerprint[] {
  const held = within(reached, now);
  return [
    ...repeatedShapes(held, "Bash", "no single call answers the question"),
    ...repeatedShapes(held, "Read", "a dump where a view was needed"),
    ...rewrittenSoon(held),
    ...longReadRun(held),
  ];
}

export type Metric = {
  readonly writes: number;
  readonly reaches: number;
  readonly stalls: readonly Fingerprint[];
};

export function metricOf(reached: readonly Reached[], now: number): Metric {
  const held = within(reached, now);
  let writes = 0;
  for (const one of held) {
    if (WRITING.includes(one.tool)) writes += 1;
  }
  return { writes, reaches: held.length, stalls: stallsIn(reached, now) };
}
