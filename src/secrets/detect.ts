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
];

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const CONNECTION = /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:@\s/]+:[^@\s]+@/i;

const ASSIGNED =
  /\b(pass(?:word|wd)?|secret|token|api[-_]?key|apikey|credential|auth|private[-_]?key)\b["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i;

const BLOB = /[A-Za-z0-9+/_-]{24,}={0,2}/g;

const GIT_SHA = /^[0-9a-f]{7,40}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MIN_ENTROPY = 4.2;

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

export function looksRandom(value: string): boolean {
  if (value.length < 24) return false;
  if (GIT_SHA.test(value) || UUID.test(value)) return false;
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) return false;
  if (longestLowercaseRun(value) > LONGEST_WORD) return false;
  return entropyOf(value) >= MIN_ENTROPY;
}

function excerptOf(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 16)}…`;
}

export function findingsIn(text: string, allowed: ReadonlySet<string>): readonly Finding[] {
  const found: Finding[] = [];
  const excused = PLACEHOLDER.test(text);

  if (PRIVATE_KEY.test(text)) {
    found.push({ kind: "a private key", excerpt: excerptOf(text) });
  }
  if (CONNECTION.test(text) && !excused) {
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
  if (assigned !== null && !excused) {
    const value = assigned[2];
    if (value !== undefined && !allowed.has(value)) {
      found.push({ kind: "something named like a credential, with a value", excerpt: excerptOf(value) });
      return found;
    }
  }

  if (excused) return found;
  const blobs = text.match(BLOB);
  for (const candidate of blobs === null ? [] : blobs) {
    if (allowed.has(candidate) || !looksRandom(candidate)) continue;
    found.push({
      kind: `a ${candidate.length}-character random-looking string`,
      excerpt: excerptOf(candidate),
    });
    return found;
  }

  return found;
}
