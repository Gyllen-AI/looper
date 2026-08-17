import { INJECTION_SEPARATOR } from "./config.ts";
import type { Capability, InjectContext, Injection } from "./capability.ts";
import { reasonFrom } from "./fields.ts";

export type Allocation = {
  readonly text: string;
  readonly contributors: readonly string[];
  readonly dropped: readonly string[];
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

function droppedMarker(dropped: readonly string[]): string {
  return `[looper: ${dropped.length} contribution(s) dropped for budget — ${dropped.join(", ")}]`;
}

export function allocate(
  capabilities: readonly Capability[],
  context: InjectContext,
): AllocationRun {
  const { injections, complaints } = gather(capabilities, context);
  const ordered = [...injections].sort(byPriority);

  const parts: string[] = [];
  const contributors: string[] = [];
  const dropped: string[] = [];
  let used = 0;
  let overflowed = false;

  for (const injection of ordered) {
    const width = injection.text.length;
    const separator = parts.length === 0 ? 0 : INJECTION_SEPARATOR.length;
    const projected = used + separator + width;
    if (parts.length === 0) {
      parts.push(injection.text);
      contributors.push(injection.source);
      used = width;
      overflowed = width > context.budget;
      continue;
    }
    if (projected <= context.budget) {
      parts.push(injection.text);
      contributors.push(injection.source);
      used = projected;
      continue;
    }
    dropped.push(injection.source);
  }

  while (dropped.length > 0 && parts.length > 1) {
    const projected = used + INJECTION_SEPARATOR.length + droppedMarker(dropped).length;
    if (projected <= context.budget) break;
    const last = parts.pop();
    const name = contributors.pop();
    if (last === undefined || name === undefined) break;
    used -= last.length + INJECTION_SEPARATOR.length;
    dropped.push(name);
  }

  if (dropped.length > 0) parts.push(droppedMarker(dropped));

  const text = parts.join(INJECTION_SEPARATOR);
  return {
    allocation: {
      text,
      contributors,
      dropped,
      overflowed: overflowed || text.length > context.budget,
      chars: text.length,
    },
    complaints,
  };
}
