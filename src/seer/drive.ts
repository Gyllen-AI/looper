import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  SEER_CAPTURE,
  SEER_ASK,
  SEER_CONSENT,
  SEER_DIR,
  SEER_EXCHANGE_DIR,
  SEER_LIVE_WAIT_MS,
  SEER_SAID,
  SEER_STARTING_WAIT_MS,
  SEER_MAX_OUTPUT,
  SEER_TIMEOUT_MS,
  WINDOWS_SHELL,
  whereTheUserLives,
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

export function exchangeAt(): string {
  return join(whereTheUserLives(), SEER_EXCHANGE_DIR);
}

function restFor(millis: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, millis);
}

function startCapturer(shell: string, looperRoot: string): void {
  const child = spawn(
    shell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptFor(looperRoot),
      "-Serve",
      "-Exchange",
      windowsPathFor(exchangeAt()),
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

type Heard =
  | { readonly kind: "said"; readonly raw: string }
  | { readonly kind: "nothing"; readonly why: string };

function answerWithin(said: string, millis: number): Heard {
  const began = Date.now();
  while (Date.now() - began < millis) {
    if (existsSync(said)) {
      try {
        const raw = readFileSync(said, "utf8");
        rmSync(said, { force: true });
        if (raw.length > 0) return { kind: "said", raw };
      } catch (cause) {
        return { kind: "nothing", why: `its answer could not be read (${reasonFrom(cause)})` };
      }
    }
    restFor(4);
  }
  return { kind: "nothing", why: `nothing answered within ${millis}ms` };
}

export type Live =
  | { readonly kind: "shot"; readonly shot: Shot }
  | { readonly kind: "fell-back"; readonly why: string };

export function liveCaptureWith(shell: string, looperRoot: string, window: string): Live {
  mkdirSync(exchangeAt(), { recursive: true });
  const ask = join(exchangeAt(), SEER_ASK);
  const said = join(exchangeAt(), SEER_SAID);
  rmSync(said, { force: true });

  writeFileSync(ask, window, "utf8");
  let heard = answerWithin(said, SEER_LIVE_WAIT_MS);
  if (heard.kind === "nothing") {
    startCapturer(shell, looperRoot);
    writeFileSync(ask, window, "utf8");
    heard = answerWithin(said, SEER_STARTING_WAIT_MS);
  }
  rmSync(ask, { force: true });
  if (heard.kind === "nothing") return { kind: "fell-back", why: heard.why };

  let payload: unknown;
  try {
    payload = JSON.parse(heard.raw);
  } catch (cause) {
    return { kind: "fell-back", why: `its answer was not JSON (${reasonFrom(cause)})` };
  }
  const refused = fieldAt(payload, "refused");
  if (refused === DISARMED) return { kind: "shot", shot: { kind: "disarmed" } };
  if (refused === NOT_FOUND) return { kind: "shot", shot: { kind: "not-found", named: window } };
  if (refused === UNREACHABLE) return { kind: "shot", shot: { kind: "unreachable" } };
  if (typeof refused === "number") return { kind: "fell-back", why: `it refused with ${refused}` };
  return { kind: "shot", shot: readAnswer(heard.raw) };
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
  const live = liveCaptureWith(WINDOWS_SHELL, looperRoot, window);
  if (live.kind === "shot") return live.shot;
  const slow = captureWith(WINDOWS_SHELL, looperRoot, window);
  if (slow.kind !== "unavailable") return slow;
  return { kind: "unavailable", detail: `${slow.detail}. The live capturer was tried first and ${live.why}.` };
}
