import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

import { BACKUP_SUFFIX, TEMP_SUFFIX } from "./config.ts";
import { AtomicWriteFailed } from "./errors.ts";
import { reasonFrom } from "./fields.ts";

export type Backup =
  | { readonly kind: "none" }
  | { readonly kind: "kept"; readonly path: string };

export type Written = {
  readonly path: string;
  readonly backup: Backup;
};

function keepPrior(path: string): Backup {
  if (!existsSync(path)) return { kind: "none" };
  const kept = `${path}${BACKUP_SUFFIX}`;
  copyFileSync(path, kept);
  return { kind: "kept", path: kept };
}

function flushToDisk(temp: string, text: string): void {
  const handle = openSync(temp, "w");
  try {
    writeSync(handle, text);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function discard(temp: string): void {
  if (existsSync(temp)) unlinkSync(temp);
}

export function writeAtomically(path: string, text: string): Written {
  const temp = `${path}${TEMP_SUFFIX}`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const backup = keepPrior(path);
    flushToDisk(temp, text);
    renameSync(temp, path);
    return { path, backup };
  } catch (cause) {
    discard(temp);
    const detail = reasonFrom(cause);
    throw new AtomicWriteFailed(path, detail);
  }
}
