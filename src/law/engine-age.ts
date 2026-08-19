import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { reasonFrom } from "../fields.ts";

export type Freshness =
  | { readonly kind: "current" }
  | { readonly kind: "rebuild"; readonly why: string };

type Scanned = {
  readonly newest: number;
  readonly unreadable: readonly string[];
};

function scan(at: string): Scanned {
  let newest = 0;
  const unreadable: string[] = [];
  let entries: readonly string[] = [];

  try {
    entries = readdirSync(at);
  } catch (cause) {
    return { newest, unreadable: [`${at} (${reasonFrom(cause)})`] };
  }

  for (const entry of entries) {
    const here = join(at, entry);
    let held;
    try {
      held = statSync(here);
    } catch (cause) {
      unreadable.push(`${here} (${reasonFrom(cause)})`);
      continue;
    }
    if (held.isDirectory()) {
      const below = scan(here);
      newest = Math.max(newest, below.newest);
      unreadable.push(...below.unreadable);
      continue;
    }
    newest = Math.max(newest, held.mtimeMs);
  }

  return { newest, unreadable };
}

function writtenAt(sources: readonly string[], manifests: readonly string[]): Scanned {
  let newest = 0;
  const unreadable: string[] = [];

  for (const at of sources) {
    const held = scan(at);
    newest = Math.max(newest, held.newest);
    unreadable.push(...held.unreadable);
  }
  for (const path of manifests) {
    try {
      newest = Math.max(newest, statSync(path).mtimeMs);
    } catch (cause) {
      unreadable.push(`${path} (${reasonFrom(cause)})`);
    }
  }

  return { newest, unreadable };
}

export function freshnessOf(
  binary: string,
  sources: readonly string[],
  manifests: readonly string[],
): Freshness {
  let built;
  try {
    built = statSync(binary);
  } catch (cause) {
    return { kind: "rebuild", why: `there is nothing built at ${binary} (${reasonFrom(cause)})` };
  }

  const written = writtenAt(sources, manifests);
  if (written.unreadable.length > 0) {
    return {
      kind: "rebuild",
      why: `whether the engine is current could not be decided, because ${written.unreadable.join(", ")} could not be read`,
    };
  }
  if (built.mtimeMs < written.newest) {
    return { kind: "rebuild", why: "the engine source changed after the binary was built" };
  }
  return { kind: "current" };
}
