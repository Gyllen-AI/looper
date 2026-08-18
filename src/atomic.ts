import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

import { BACKUP_SUFFIX, TEMP_SUFFIX } from "./config.ts";
import { AtomicWriteFailed } from "./errors.ts";
import { fieldAt, reasonFrom } from "./fields.ts";

export type Held =
  | { readonly kind: "held" }
  | { readonly kind: "busy"; readonly why: string };

const LOCK_SUFFIX = ".looper-lock";

const LOCK_TRIES = 50;

const LOCK_WAIT_MS = 20;

const LOCK_STALE_MS = 5000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function takeLock(path: string): boolean {
  try {
    closeSync(openSync(path, "wx"));
    return true;
  } catch (cause) {
    if (fieldAt(cause, "code") !== "EEXIST") throw cause;
    return false;
  }
}

function isStale(path: string): boolean {
  if (!existsSync(path)) return false;
  return Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS;
}

export function withLock(path: string, body: () => void): Held {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}${LOCK_SUFFIX}`;

  for (let tries = 0; tries < LOCK_TRIES; tries += 1) {
    if (takeLock(lock)) {
      try {
        body();
      } finally {
        if (existsSync(lock)) unlinkSync(lock);
      }
      return { kind: "held" };
    }
    if (isStale(lock)) unlinkSync(lock);
    sleep(LOCK_WAIT_MS);
  }

  return {
    kind: "busy",
    why: `${lock} was held by another looper for ${(LOCK_TRIES * LOCK_WAIT_MS) / 1000} seconds`,
  };
}

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

function written(path: string, text: string, keeping: boolean): Written {
  const temp = `${path}${TEMP_SUFFIX}`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const backup = keepPrior(path);
    flushToDisk(temp, text);
    renameSync(temp, path);
    if (keeping) return { path, backup };
    if (backup.kind === "kept") unlinkSync(backup.path);
    return { path, backup: { kind: "none" } };
  } catch (cause) {
    discard(temp);
    const detail = reasonFrom(cause);
    throw new AtomicWriteFailed(path, detail);
  }
}

export function writeAtomically(path: string, text: string): Written {
  return written(path, text, false);
}

export function writeKeepingPrior(path: string, text: string): Written {
  return written(path, text, true);
}
