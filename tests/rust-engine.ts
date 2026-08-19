import { join } from "node:path";

import { buildEngine, engineIsBuilt } from "../src/law/rust/drive.ts";

const LOOPER_ROOT = join(import.meta.dirname, "..");

function whyTheEngineIsNotHere(): string | undefined {
  if (engineIsBuilt(LOOPER_ROOT)) return undefined;
  const built = buildEngine(LOOPER_ROOT);
  if (engineIsBuilt(LOOPER_ROOT)) return undefined;
  const detail =
    built.kind === "unavailable"
      ? built.detail
      : "cargo reported success and the binary is still older than its source";
  return `looper's Rust engine is not built and could not be built here, so these say nothing either way (${detail})`;
}

export const RUST_ROOT = LOOPER_ROOT;

export const NO_RUST_ENGINE = whyTheEngineIsNotHere();

export const WITHOUT_THE_RUST_ENGINE = NO_RUST_ENGINE === undefined ? {} : { skip: NO_RUST_ENGINE };
