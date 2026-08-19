import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  CSHARP_BUILD_TIMEOUT_MS,
  CSHARP_ENGINE_DIR,
  CSHARP_ENGINE_NAME,
  CSHARP_ENGINE_PROJECT,
  CSHARP_TIMEOUT_MS,
  A_READER_MAY_ANSWER_WITH,
} from "../../config.ts";
import { fieldAt, reasonFrom } from "../../fields.ts";
import { freshnessOf } from "../engine-age.ts";

export type CsharpHit = {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
};

export type Unreadable = {
  readonly file: string;
  readonly detail: string;
};

export type Judged =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "refused"; readonly detail: string }
  | {
      readonly kind: "found";
      readonly hits: readonly CsharpHit[];
      readonly unreadable: readonly Unreadable[];
    };

export function engineIsHere(looperRoot: string): boolean {
  return existsSync(join(looperRoot, CSHARP_ENGINE_DIR, CSHARP_ENGINE_PROJECT));
}

export function engineIsBuilt(looperRoot: string): boolean {
  const engine = join(looperRoot, CSHARP_ENGINE_DIR);
  return (
    freshnessOf(builtAt(looperRoot), [join(engine, "src")], [join(engine, CSHARP_ENGINE_PROJECT)])
      .kind === "current"
  );
}

function builtAt(looperRoot: string): string {
  return join(looperRoot, CSHARP_ENGINE_DIR, "bin", "Release", "net10.0", CSHARP_ENGINE_NAME);
}


export function buildEngine(looperRoot: string): Judged {
  try {
    execFileSync("dotnet", ["build", "-c", "Release", "--nologo", "-v", "q"], {
      cwd: join(looperRoot, CSHARP_ENGINE_DIR),
      encoding: "utf8",
      timeout: CSHARP_BUILD_TIMEOUT_MS,
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (cause) {
    return {
      kind: "unavailable",
      detail: `looper's C# half would not build (${reasonFrom(cause)})`,
    };
  }
  return { kind: "found", hits: [], unreadable: [] };
}

function hitsFrom(payload: unknown): readonly CsharpHit[] {
  const held = fieldAt(payload, "violations");
  if (!Array.isArray(held)) return [];
  const found: CsharpHit[] = [];
  for (const one of held) {
    const rule = fieldAt(one, "rule");
    const file = fieldAt(one, "file");
    const line = fieldAt(one, "line");
    if (typeof rule !== "string" || typeof file !== "string" || typeof line !== "number") continue;
    found.push({ rule, file, line });
  }
  return found;
}

function unreadableFrom(payload: unknown): readonly Unreadable[] {
  const held = fieldAt(payload, "unreadable");
  if (!Array.isArray(held)) return [];
  const found: Unreadable[] = [];
  for (const one of held) {
    const file = fieldAt(one, "file");
    const detail = fieldAt(one, "detail");
    if (typeof file !== "string" || typeof detail !== "string") continue;
    found.push({ file, detail });
  }
  return found;
}

function ranWith(binary: string, args: readonly string[]): Judged {
  let output = "";
  try {
    output = execFileSync(binary, [...args], {
      encoding: "utf8",
      timeout: CSHARP_TIMEOUT_MS,
      maxBuffer: A_READER_MAY_ANSWER_WITH,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (cause) {
    const said = fieldAt(cause, "stdout");
    if (typeof said !== "string" || said.length === 0) {
      return { kind: "unavailable", detail: reasonFrom(cause) };
    }
    output = said;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(output);
  } catch (cause) {
    return { kind: "unavailable", detail: `it did not answer in JSON (${reasonFrom(cause)})` };
  }

  const refused = fieldAt(payload, "error");
  if (typeof refused === "string") return { kind: "refused", detail: refused };
  return { kind: "found", hits: hitsFrom(payload), unreadable: unreadableFrom(payload) };
}

export function judgeCsharp(
  looperRoot: string,
  projectRoot: string,
  files: readonly string[],
): Judged {
  if (files.length === 0) return { kind: "found", hits: [], unreadable: [] };
  if (!engineIsHere(looperRoot)) {
    return { kind: "unavailable", detail: "looper's C# reader is not in this copy" };
  }
  if (!engineIsBuilt(looperRoot)) {
    const built = buildEngine(looperRoot);
    if (built.kind !== "found") return built;
  }
  return ranWith(builtAt(looperRoot), [projectRoot, ...files]);
}
