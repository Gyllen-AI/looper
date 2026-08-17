import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { SEER_DIR, SEER_NAME, SEER_TIMEOUT_MS } from "../config.ts";
import { fieldAt, reasonFrom } from "../fields.ts";

export type Image = {
  readonly label: string;
  readonly media: string;
  readonly base64: string;
};

export type Shot =
  | { readonly kind: "not-installed"; readonly platform: string }
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "disarmed" }
  | { readonly kind: "not-found"; readonly named: string }
  | { readonly kind: "seen"; readonly images: readonly Image[]; readonly missing: readonly string[] };

const DISARMED = 5;

const NOT_FOUND = 3;

export function seerAt(looperRoot: string): string {
  return join(looperRoot, SEER_DIR, process.platform, SEER_NAME);
}

export function seerIsInstalled(looperRoot: string): boolean {
  return existsSync(seerAt(looperRoot));
}

function imagesFrom(payload: unknown): readonly Image[] {
  const held = fieldAt(payload, "images");
  if (!Array.isArray(held)) return [];
  const found: Image[] = [];
  for (const one of held) {
    const label = fieldAt(one, "label");
    const media = fieldAt(one, "media");
    const base64 = fieldAt(one, "base64");
    if (typeof label !== "string" || typeof media !== "string" || typeof base64 !== "string") {
      continue;
    }
    found.push({ label, media, base64 });
  }
  return found;
}

function missingFrom(payload: unknown): readonly string[] {
  const held = fieldAt(payload, "missing");
  if (!Array.isArray(held)) return [];
  return held.filter((one) => typeof one === "string");
}

function readAnswer(output: string): Shot {
  let payload: unknown;
  try {
    payload = JSON.parse(output);
  } catch (cause) {
    return { kind: "unavailable", detail: `it did not answer in JSON (${reasonFrom(cause)})` };
  }
  return { kind: "seen", images: imagesFrom(payload), missing: missingFrom(payload) };
}

export function capture(looperRoot: string, window: string): Shot {
  if (!seerIsInstalled(looperRoot)) {
    return { kind: "not-installed", platform: process.platform };
  }

  let output = "";
  try {
    output = execFileSync(seerAt(looperRoot), ["--window", window], {
      encoding: "utf8",
      timeout: SEER_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (cause) {
    const status = fieldAt(cause, "status");
    if (status === DISARMED) return { kind: "disarmed" };
    if (status === NOT_FOUND) return { kind: "not-found", named: window };
    return { kind: "unavailable", detail: reasonFrom(cause) };
  }

  return readAnswer(output);
}
