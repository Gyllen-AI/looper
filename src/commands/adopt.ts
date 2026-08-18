import type { Out } from "../out.ts";
import { isShape, type Adopted } from "../adopt/shapes.ts";
import {
  proposalFor,
  readAdopted,
  rememberProposal,
  withRule,
  writeAdopted,
} from "../adopt/store.ts";
import { proposeRule, ratify } from "../adopt/ratify.ts";
import { saidOr, valueAfter } from "./args.ts";
import { here } from "../session.ts";

function proposalFrom(args: readonly string[]): Adopted | null {
  const shape = valueAfter(args, "--shape");
  const what = valueAfter(args, "--what");
  if (shape.kind === "none" || what.kind === "none" || !isShape(shape.value)) return null;
  return {
    shape: shape.value,
    what: what.value,
    because: saidOr(valueAfter(args, "--because"), "adopted by this project"),
    instead: [saidOr(valueAfter(args, "--instead"), "there is no replacement recorded")],
    evidence: [],
  };
}

export function adopt(args: readonly string[], out: Out): number {
  const root = here();
  const proposed = proposalFrom(args);
  if (proposed === null) {
    out.warn(
      [
        "looper adopt needs to know what rule you are proposing:",
        '  looper adopt --shape banned-symbol --what moment --because "we moved to Temporal" --instead "Temporal.Now"',
        "  looper adopt --shape banned-import --what lodash --because ... --instead ...",
        "",
        "Add --take once you have rewritten every place it catches.",
      ].join("\n"),
    );
    return 2;
  }

  if (!args.includes("--take")) {
    const proposal = proposeRule(root, proposed);
    if (proposal.kind === "no-evidence") {
      out.warn(
        [
          `looper will not adopt a rule about "${proposal.what}": nothing in this project does it.`,
          "A rule with no instance here is a guess about the future, and guesses are how",
          "a rule set turns into a maze. Propose it again when something actually does it.",
        ].join("\n"),
      );
      return 2;
    }
    rememberProposal(
      root,
      proposed,
      proposal.where.map((one) => `${one.file}:${one.line}`),
    );
    out.say(
      [
        `${proposal.where.length} place(s) in this project would break this rule:`,
        ...proposal.where.map((one) => `  ${one.file}:${one.line}`),
        "",
        "Rewrite every one of them, check the project still works, then run the same",
        "command again with --take. looper will refuse to adopt it while any remain,",
        "because a rule nobody can obey here is not a strict rule, it is a broken one.",
      ].join("\n"),
    );
    return 0;
  }

  const pending = proposalFor(root, proposed);
  if (pending.kind === "none") {
    out.warn(
      [
        `Not adopted: ${pending.why}.`,
        "Propose it first, without --take, so looper can record where it happens.",
        "The places it used to happen are what justify the rule existing at all.",
      ].join("\n"),
    );
    return 2;
  }
  const verdict = ratify(root, proposed, pending.evidence);
  if (verdict.kind === "refused") {
    out.warn(
      [
        `Not adopted. ${verdict.remaining.length} place(s) still break it:`,
        ...verdict.remaining.map((one) => `  ${one.file}:${one.line}`),
      ].join("\n"),
    );
    return 2;
  }

  writeAdopted(root, withRule(readAdopted(root), verdict.rule));
  out.say(
    [
      `Adopted: ${verdict.rule.shape} ${verdict.rule.what}`,
      `  Nothing in this project does it any more, which is what earned it.`,
      `  Recorded in .looper/adopted.toml with the ${verdict.rule.evidence.length} place(s) it used to happen:`,
      ...verdict.rule.evidence.map((one) => `    ${one}`),
      `  From now it stops new code only. Delete the entry to drop the rule.`,
    ].join("\n"),
  );
  return 0;
}
