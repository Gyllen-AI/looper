import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { RUST_ENGINE_DIR, RUST_ENGINE_NAME, RUST_TIMEOUT_MS } from "../../config.ts";
import { fieldAt, reasonFrom } from "../../fields.ts";

export type RustHit = {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
};

const ENGINE_MANIFESTS: readonly string[] = ["Cargo.toml", "Cargo.lock"];

export type Judged =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "refused"; readonly detail: string }
  | { readonly kind: "found"; readonly hits: readonly RustHit[]; readonly names: readonly string[] };

function builtAt(looperRoot: string): string {
  return join(looperRoot, RUST_ENGINE_DIR, "target", "release", RUST_ENGINE_NAME);
}

function newestUnder(at: string): number {
  let newest = 0;
  let entries: readonly string[] = [];
  try {
    entries = readdirSync(at);
  } catch {
    return newest;
  }
  for (const entry of entries) {
    const here = join(at, entry);
    let held;
    try {
      held = statSync(here);
    } catch {
      continue;
    }
    if (held.isDirectory()) {
      newest = Math.max(newest, newestUnder(here));
      continue;
    }
    newest = Math.max(newest, held.mtimeMs);
  }
  return newest;
}

function engineWrittenAt(looperRoot: string): number {
  const engine = join(looperRoot, RUST_ENGINE_DIR);
  let newest = newestUnder(join(engine, "src"));
  for (const name of ENGINE_MANIFESTS) {
    try {
      newest = Math.max(newest, statSync(join(engine, name)).mtimeMs);
    } catch {
      continue;
    }
  }
  return newest;
}

export function engineIsBuilt(looperRoot: string): boolean {
  const binary = builtAt(looperRoot);
  if (!existsSync(binary)) return false;
  let standing;
  try {
    standing = statSync(binary);
  } catch {
    return false;
  }
  return standing.mtimeMs >= engineWrittenAt(looperRoot);
}

export function buildEngine(looperRoot: string): Judged {
  try {
    execFileSync("cargo", ["build", "--offline", "--release"], {
      cwd: join(looperRoot, RUST_ENGINE_DIR),
      encoding: "utf8",
      timeout: RUST_TIMEOUT_MS,
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (cause) {
    return {
      kind: "unavailable",
      detail: `looper's Rust half would not build (${reasonFrom(cause)})`,
    };
  }
  return { kind: "found", hits: [], names: [] };
}

function namesFrom(payload: unknown): readonly string[] {
  const held = fieldAt(payload, "commands");
  if (!Array.isArray(held)) return [];
  return held.filter((one): one is string => typeof one === "string");
}

function hitsFrom(payload: unknown): readonly RustHit[] {
  const held = fieldAt(payload, "violations");
  if (!Array.isArray(held)) return [];
  const found: RustHit[] = [];
  for (const one of held) {
    const rule = fieldAt(one, "rule");
    const file = fieldAt(one, "file");
    const line = fieldAt(one, "line");
    if (typeof rule !== "string" || typeof file !== "string" || typeof line !== "number") continue;
    found.push({ rule, file, line });
  }
  return found;
}

function ranWith(binary: string, args: readonly string[]): Judged {
  let output = "";
  try {
    output = execFileSync(binary, [...args], {
      encoding: "utf8",
      timeout: RUST_TIMEOUT_MS,
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
  return { kind: "found", hits: hitsFrom(payload), names: namesFrom(payload) };
}

export type Commands =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "named"; readonly names: ReadonlySet<string> };

export function commandsUnder(looperRoot: string, crateRoot: string): Commands {
  if (!engineIsBuilt(looperRoot)) {
    const built = buildEngine(looperRoot);
    if (built.kind !== "found") return { kind: "unavailable", detail: built.detail };
  }
  const said = ranWith(builtAt(looperRoot), ["--commands", crateRoot]);
  if (said.kind !== "found") {
    return { kind: "unavailable", detail: said.kind === "refused" ? said.detail : said.detail };
  }
  return { kind: "named", names: new Set(said.names) };
}

export function judgeRust(
  looperRoot: string,
  projectRoot: string,
  files: readonly string[],
): Judged {
  if (!engineIsBuilt(looperRoot)) {
    const built = buildEngine(looperRoot);
    if (built.kind !== "found") return built;
  }
  return ranWith(builtAt(looperRoot), [projectRoot, ...files]);
}

export type Shaped =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "found"; readonly payload: unknown };

export function shapeFromRust(
  looperRoot: string,
  path: string,
  line: number,
  depth: number,
): Shaped {
  if (!engineIsBuilt(looperRoot)) {
    const built = buildEngine(looperRoot);
    if (built.kind !== "found") {
      return { kind: "unavailable", detail: `looper's Rust half is not built (${built.detail})` };
    }
  }
  let output = "";
  try {
    output = execFileSync(builtAt(looperRoot), ["--shape", path, String(line), String(depth)], {
      encoding: "utf8",
      timeout: RUST_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (cause) {
    return { kind: "unavailable", detail: `the Rust reader would not run (${reasonFrom(cause)})` };
  }
  try {
    return { kind: "found", payload: JSON.parse(output) };
  } catch (cause) {
    return { kind: "unavailable", detail: `it did not answer in JSON (${reasonFrom(cause)})` };
  }
}
