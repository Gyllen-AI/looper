import { countIn } from "../present.ts";
export type Finding = {
  readonly kind: string;
  readonly excerpt: string;
};

const PLACEHOLDER =
  /change[-_ ]?me|example|<[^>]+>|redacted|xxxx|your[-_]|dummy|placeholder|todo|\$\{[^}]*\}|process\.env\.|import\.meta\.env\./i;

const VENDOR: readonly (readonly [RegExp, string])[] = [
  [/AKIA[0-9A-Z]{16}/, "an AWS access key"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/github_pat_[A-Za-z0-9_]{40,}/, "a GitHub token"],
  [/glpat-[A-Za-z0-9_-]{18,}/, "a GitLab token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/sk_live_[A-Za-z0-9]{20,}/, "a Stripe live key"],
  [/sk-[A-Za-z0-9]{32,}/, "an API key"],
  [/AIza[0-9A-Za-z_-]{35}/, "a Google API key"],
  [/SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "a SendGrid key"],
  [/npm_[A-Za-z0-9]{36}/, "an npm token"],
  [/\bEAA[A-Za-z0-9]{60,}/, "a Meta access token"],
];

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const CONNECTION = /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:@\s/]+:[^@\s]+@/i;

const NAMED_ANYWHERE =
  "pass(?:word|wd)|secret|token|api[-_]?key|apikey|credential|private[-_]?key";

const NAMED_ON_ITS_OWN = "pass|auth";

const ASSIGNED = new RegExp(
  `(?:[A-Za-z0-9_]*(?:${NAMED_ANYWHERE})|(?<![A-Za-z0-9])(?:${NAMED_ON_ITS_OWN}))` +
    `\\b["']?\\s*[:=]\\s*` +
    `(?:["']([^"'\\s]{12,})["']|([^\\s"';,()\\[\\]{}]{12,})(?=\\s|$))`,
  "i",
);

const BLOB = /[A-Za-z0-9+/_-]{24,}={0,2}/g;

// `token = config.apiToken` reads a credential out of an object; it is not one. The
// value used to be matched without dots at all, which kept that quiet and also lost
// every password with a full stop in it — SUPABASE_DB_PASSWORD=Ab3.xY7%zQ*w?Kd walked
// through the gate. Dots are allowed in a value now, and a value that is nothing but a
// dotted path of identifiers is read as code instead. The length ceiling keeps the
// exemption away from long credentials that happen to look that way.
const A_DOTTED_PATH = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/;

const LONGEST_PATH = 40;

function readsSomethingElse(hit: RegExpExecArray): boolean {
  const unquoted = hit[2];
  if (unquoted === undefined) return false;   // in quotes it is a literal, not a path
  return unquoted.length < LONGEST_PATH && A_DOTTED_PATH.test(unquoted);
}

const GIT_SHA = /^(?:[0-9a-f]{7}|[0-9a-f]{8}|[0-9a-f]{40}|[0-9a-f]{64})$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MIN_ENTROPY = 4.2;

const ONE_CASE_MIN_ENTROPY = 3.0;

const HEX_ONLY = /^[0-9a-f]+$/i;

const BASE32_ONLY = /^[a-z2-7]+$/i;

const BASE32_MIN_DIGITS = 3;

const ONE_CASE_MIN_LENGTH = 32;

const SUBRESOURCE = /^sha(?:256|384|512)-/;

const A_URL = "://";

const LONGEST_WORD = 7;

export function entropyOf(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, countIn(counts, character) + 1);
  let total = 0;
  for (const [, count] of counts) {
    const share = count / value.length;
    total -= share * Math.log2(share);
  }
  return total;
}

function longestLowercaseRun(value: string): number {
  let best = 0;
  let run = 0;
  for (const character of value) {
    run = /[a-z]/.test(character) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function isMixedCase(value: string): boolean {
  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}

export function looksRandom(value: string): boolean {
  if (value.length < 24) return false;
  if (GIT_SHA.test(value) || UUID.test(value) || SUBRESOURCE.test(value)) return false;
  if (isMixedCase(value)) {
    if (longestLowercaseRun(value) > LONGEST_WORD) return false;
    return entropyOf(value) >= MIN_ENTROPY;
  }
  if (value.length < ONE_CASE_MIN_LENGTH) return false;
  if (HEX_ONLY.test(value)) return entropyOf(value) >= ONE_CASE_MIN_ENTROPY;
  if (!BASE32_ONLY.test(value)) return false;
  const digits = value.replace(/[^0-9]/g, "").length;
  if (digits < BASE32_MIN_DIGITS) return false;
  return entropyOf(value) >= ONE_CASE_MIN_ENTROPY;
}

function excerptOf(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 16)}…`;
}

function valueIn(hit: RegExpExecArray): string | undefined {
  const quoted = hit[1];
  if (quoted !== undefined) return quoted;
  return hit[2];
}

export function findingsIn(text: string, allowed: ReadonlySet<string>): readonly Finding[] {
  const found: Finding[] = [];

  if (PRIVATE_KEY.test(text)) {
    found.push({ kind: "a private key", excerpt: excerptOf(text) });
  }
  const connection = CONNECTION.exec(text);
  if (connection !== null && !PLACEHOLDER.test(connection[0])) {
    found.push({ kind: "a database address with its password in it", excerpt: excerptOf(text) });
  }
  for (const [shape, kind] of VENDOR) {
    const hit = shape.exec(text);
    if (hit === null || allowed.has(hit[0])) continue;
    if (PLACEHOLDER.test(hit[0])) continue;
    found.push({ kind, excerpt: excerptOf(hit[0]) });
  }
  if (found.length > 0) return found;

  const assigned = ASSIGNED.exec(text);
  if (assigned !== null) {
    const value = valueIn(assigned);
    const real =
      value !== undefined &&
      !allowed.has(value) &&
      !PLACEHOLDER.test(value) &&
      !value.includes(A_URL) &&
      !readsSomethingElse(assigned);
    if (real && value !== undefined) {
      found.push({ kind: "something named like a credential, with a value", excerpt: excerptOf(value) });
      return found;
    }
  }

  const blobs = text.match(BLOB);
  for (const candidate of blobs === null ? [] : blobs) {
    if (allowed.has(candidate) || PLACEHOLDER.test(candidate)) continue;
    if (!looksRandom(candidate)) continue;
    found.push({
      kind: `a ${candidate.length}-character random-looking string`,
      excerpt: excerptOf(candidate),
    });
    return found;
  }

  return found;
}
