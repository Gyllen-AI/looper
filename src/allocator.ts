import { INJECTION_SEPARATOR } from "./config.ts";
import type { Capability, InjectContext, Injection } from "./capability.ts";
import { reasonFrom } from "./fields.ts";

export type Weighed = { readonly source: string; readonly chars: number; readonly summary?: string };

export type Allocation = {
  readonly text: string;
  readonly contributors: readonly string[];
  readonly weighed: readonly Weighed[];
  readonly dropped: readonly Weighed[];
  readonly overflowed: boolean;
  readonly chars: number;
};

export type Complaint = {
  readonly capability: string;
  readonly detail: string;
};

export type AllocationRun = {
  readonly allocation: Allocation;
  readonly complaints: readonly Complaint[];
};

function gather(
  capabilities: readonly Capability[],
  context: InjectContext,
): { injections: Injection[]; complaints: Complaint[] } {
  const injections: Injection[] = [];
  const complaints: Complaint[] = [];
  for (const capability of capabilities) {
    try {
      injections.push(...capability.inject(context));
    } catch (cause) {
      const detail = reasonFrom(cause);
      complaints.push({ capability: capability.name, detail });
    }
  }
  return { injections, complaints };
}

function byPriority(left: Injection, right: Injection): number {
  return left.priority - right.priority;
}

function droppedMarker(dropped: readonly Weighed[]): string {
  const named = dropped
    .map((one) => {
      const said = one.summary === undefined ? "" : `: ${one.summary}`;
      return `\n  ${one.source} (${one.chars} chars)${said}`;
    })
    .join("");
  return `[looper: ${dropped.length} contribution(s) dropped for budget. Each is listed with what it holds, so this is an index and not a silence: pull the one your work touches by name with the doctrine tool, and run looper law for the outstanding-work count.${named}\n]`;
}

function overBudgetMarker(chars: number, budget: number): string {
  return [
    `[looper: the rules for what you are touching came to ${chars} characters and the`,
    `budget is ${budget}. Every one of them is below anyway, because a rule that never`,
    `arrived reads exactly like a rule that was followed. Nothing was silently cut.]`,
  ].join(" ");
}

export function allocate(
  capabilities: readonly Capability[],
  context: InjectContext,
): AllocationRun {
  const { injections, complaints } = gather(capabilities, context);
  const ordered = [...injections].sort(byPriority);

  const parts: string[] = [];
  const contributors: string[] = [];
  const weighed: Weighed[] = [];
  const dropped: Weighed[] = [];
  let used = 0;

  const take = (injection: Injection): void => {
    const width = injection.text.length;
    const separator = parts.length === 0 ? 0 : INJECTION_SEPARATOR.length;
    parts.push(injection.text);
    contributors.push(injection.source);
    weighed.push({ source: injection.source, chars: width, summary: injection.summary });
    used += separator + width;
  };

  for (const injection of ordered) {
    if (injection.required) {
      take(injection);
      continue;
    }
    const separator = parts.length === 0 ? 0 : INJECTION_SEPARATOR.length;
    if (used + separator + injection.text.length <= context.budget) {
      take(injection);
      continue;
    }
    dropped.push({
      source: injection.source,
      chars: injection.text.length,
      summary: injection.summary,
    });
  }

  const requiredAlone = used > context.budget;

  while (dropped.length > 0 && parts.length > 1 && !requiredAlone) {
    const projected = used + INJECTION_SEPARATOR.length + droppedMarker(dropped).length;
    if (projected <= context.budget) break;
    const last = parts.pop();
    const name = contributors.pop();
    const held = weighed.pop();
    if (last === undefined || name === undefined || held === undefined) break;
    if (ordered.some((one) => one.source === name && one.required)) {
      parts.push(last);
      contributors.push(name);
      weighed.push(held);
      break;
    }
    used -= last.length + INJECTION_SEPARATOR.length;
    dropped.push(held);
  }

  if (dropped.length > 0) parts.push(droppedMarker(dropped));
  if (requiredAlone) parts.push(overBudgetMarker(used, context.budget));

  const text = parts.join(INJECTION_SEPARATOR);
  return {
    allocation: {
      text,
      contributors,
      weighed,
      dropped,
      overflowed: requiredAlone || text.length > context.budget,
      chars: text.length,
    },
    complaints,
  };
}
