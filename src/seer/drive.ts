import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  SEER_CAPTURE,
  SEER_CONSENT,
  SEER_DIR,
  SEER_MAX_OUTPUT,
  SEER_TIMEOUT_MS,
  WINDOWS_SHELL,
  underWsl,
} from "../config.ts";
import { fieldAt, reasonFrom } from "../fields.ts";

export type State = "rendering" | "minimised" | "blank" | "unknown";

const STATES: readonly State[] = ["rendering", "minimised", "blank"];

export type Image = {
  readonly label: string;
  readonly media: string;
  readonly base64: string;
  readonly state: State;
};

function stateFrom(said: unknown): State {
  if (typeof said !== "string") return "unknown";
  const known = STATES.find((held) => held === said);
  if (known === undefined) return "unknown";
  return known;
}

export type Shot =
  | { readonly kind: "not-installed"; readonly platform: string }
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "unreachable" }
  | { readonly kind: "disarmed" }
  | { readonly kind: "not-found"; readonly named: string }
  | { readonly kind: "seen"; readonly images: readonly Image[]; readonly missing: readonly string[] };

export type Standing =
  | { readonly kind: "not-installed"; readonly platform: string }
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "unreachable" }
  | { readonly kind: "too-old" }
  | { readonly kind: "reachable"; readonly armed: readonly string[] };

const DISARMED = 5;

const NOT_FOUND = 3;

const UNREACHABLE = 6;

const TOO_OLD = 7;

export function seerAt(looperRoot: string): string {
  return join(looperRoot, SEER_DIR, SEER_CAPTURE);
}

export function looksAtWindows(): boolean {
  return process.platform === "win32" || underWsl();
}

export function seerIsInstalled(looperRoot: string): boolean {
  return looksAtWindows() && existsSync(seerAt(looperRoot));
}

function windowsPathFor(path: string): string {
  if (!underWsl()) return path;
  return execFileSync("wslpath", ["-w", path], { encoding: "utf8", maxBuffer: SEER_MAX_OUTPUT }).trim();
}

function scriptFor(looperRoot: string): string {
  return windowsPathFor(seerAt(looperRoot));
}

function askedOf(shell: string, looperRoot: string, args: readonly string[]): string {
  const asked = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFor(looperRoot), ...args];
  return execFileSync(shell, asked, {
    encoding: "utf8",
    timeout: SEER_TIMEOUT_MS,
    maxBuffer: SEER_MAX_OUTPUT,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function titlesIn(payload: unknown, field: string): readonly string[] {
  const held = fieldAt(payload, field);
  if (!Array.isArray(held)) return [];
  return held.filter((one) => typeof one === "string");
}

export type Started =
  | { readonly kind: "starting" }
  | { readonly kind: "no-consent-program"; readonly path: string }
  | { readonly kind: "could-not-start"; readonly detail: string };

export function consentAt(looperRoot: string): string {
  return join(looperRoot, SEER_DIR, SEER_CONSENT);
}

export function startConsentWith(shell: string, looperRoot: string): Started {
  const script = consentAt(looperRoot);
  if (!existsSync(script)) return { kind: "no-consent-program", path: script };
  try {
    const child = spawn(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", windowsPathFor(script)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return { kind: "starting" };
  } catch (cause) {
    return { kind: "could-not-start", detail: reasonFrom(cause) };
  }
}

export function startConsent(looperRoot: string): Started {
  if (!looksAtWindows()) return { kind: "no-consent-program", path: consentAt(looperRoot) };
  return startConsentWith(WINDOWS_SHELL, looperRoot);
}

export function standingWith(shell: string, looperRoot: string): Standing {
  if (!existsSync(seerAt(looperRoot))) {
    return { kind: "not-installed", platform: process.platform };
  }
  let output = "";
  try {
    output = askedOf(shell, looperRoot, ["-Status"]);
  } catch (cause) {
    const status = fieldAt(cause, "status");
    if (status === UNREACHABLE) return { kind: "unreachable" };
    if (status === TOO_OLD) return { kind: "too-old" };
    return { kind: "unavailable", detail: reasonFrom(cause) };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(output);
  } catch (cause) {
    return { kind: "unavailable", detail: `it did not answer in JSON (${reasonFrom(cause)})` };
  }
  return { kind: "reachable", armed: titlesIn(payload, "armed") };
}

export function standing(looperRoot: string): Standing {
  if (!seerIsInstalled(looperRoot)) {
    return { kind: "not-installed", platform: process.platform };
  }
  return standingWith(WINDOWS_SHELL, looperRoot);
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
    found.push({ label, media, base64, state: stateFrom(fieldAt(one, "state")) });
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

export function captureWith(shell: string, looperRoot: string, window: string): Shot {
  if (!existsSync(seerAt(looperRoot))) {
    return { kind: "not-installed", platform: process.platform };
  }

  let output = "";
  try {
    output = askedOf(shell, looperRoot, ["-Window", window]);
  } catch (cause) {
    const status = fieldAt(cause, "status");
    if (status === DISARMED) return { kind: "disarmed" };
    if (status === NOT_FOUND) return { kind: "not-found", named: window };
    if (status === UNREACHABLE) return { kind: "unreachable" };
    return { kind: "unavailable", detail: reasonFrom(cause) };
  }

  return readAnswer(output);
}

export function capture(looperRoot: string, window: string): Shot {
  if (!seerIsInstalled(looperRoot)) {
    return { kind: "not-installed", platform: process.platform };
  }
  return captureWith(WINDOWS_SHELL, looperRoot, window);
}
