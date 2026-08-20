import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  isAncestorIn,
  tagsPointingAt,
  whatTheRemoteAlreadyHas,
  type Moved,
} from "../git.ts";

export type Standing =
  | { readonly kind: "reachable"; readonly ref: string }
  | { readonly kind: "named"; readonly tag: string }
  | { readonly kind: "adrift"; readonly ref: string }
  | { readonly kind: "cannot-tell"; readonly why: string };

export type Verdict = {
  readonly path: string;
  readonly to: string;
  readonly standing: Standing;
};

const NOT_CHECKED_OUT =
  "the submodule is not checked out here, so what its new pin points at cannot be read";

function short(commit: string): string {
  return commit.slice(0, 7);
}

function orATag(where: string, commit: string, ref: string): Standing {
  const tags = tagsPointingAt(where, commit);
  if (tags.kind === "cannot-tell") return { kind: "cannot-tell", why: tags.why };
  const first = tags.names[0];
  if (first !== undefined) return { kind: "named", tag: first };
  return { kind: "adrift", ref };
}

export function standingOf(root: string, moved: Moved): Standing {
  const where = join(root, moved.path);
  if (!existsSync(join(where, ".git"))) {
    return { kind: "cannot-tell", why: NOT_CHECKED_OUT };
  }
  const against = whatTheRemoteAlreadyHas(where);
  if (against.kind === "cannot-tell") return { kind: "cannot-tell", why: against.why };
  const ancestry = isAncestorIn(where, moved.to, against.revision);
  if (ancestry.kind === "cannot-tell") return { kind: "cannot-tell", why: ancestry.why };
  if (ancestry.kind === "yes") return { kind: "reachable", ref: against.revision };
  return orATag(where, moved.to, against.revision);
}

export function judge(root: string, moved: readonly Moved[]): readonly Verdict[] {
  return moved.map((one) => ({
    path: one.path,
    to: one.to,
    standing: standingOf(root, one),
  }));
}

export function unsettled(verdicts: readonly Verdict[]): readonly Verdict[] {
  return verdicts.filter((one) => one.standing.kind === "adrift" || one.standing.kind === "cannot-tell");
}

function lineFor(verdict: Verdict): string {
  const standing = verdict.standing;
  if (standing.kind === "cannot-tell") {
    return `  ${verdict.path} moves to ${short(verdict.to)}, and looper could not tell where that sits: ${standing.why}`;
  }
  if (standing.kind === "adrift") {
    return `  ${verdict.path} moves to ${short(verdict.to)}, which is not on ${standing.ref} and is not a tag`;
  }
  return `  ${verdict.path} moves to ${short(verdict.to)}`;
}

const WHAT_A_PIN_IS =
  "A submodule pin is the one line every other machine obeys. A commit that is on no branch and no tag either fails their clone outright, or quietly succeeds and leaves them running something nobody merged. Neither of those looks like an error to the person it happens to.";

const THE_TWO_WAYS_OUT =
  "If the bump is deliberate, check the submodule out at a commit that is on its default branch, or at a tag, and stage that. If it is not deliberate, and a pin swept up by `git add -A` never is, `git restore --staged <path>` leaves it where it was.";

export function reportOn(verdicts: readonly Verdict[]): string {
  const lines = verdicts.map(lineFor).join("\n");
  return `looper: this commit moves a submodule pin somewhere nobody else can follow.\n${lines}\n\n${WHAT_A_PIN_IS}\n\n${THE_TWO_WAYS_OUT}`;
}
