#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { allocate, type Allocation, type Weighed } from "./allocator.ts";
import { canonBranch } from "./canon.ts";
import { listBranches, readProjectBranch } from "./doctrine.ts";
import { matches, readMap, unheardIn } from "./map.ts";
import { trackedFiles } from "./git.ts";
import { relative } from "node:path";
import { isHookEvent, type Payload } from "./capability.ts";
import { DEV, INJECTION_BUDGET, searchPath, type Invocation } from "./config.ts";
import { describeStep } from "./announce.ts";
import { reachedFrom, runInit, type Report, type Step } from "./init.ts";
import { totalIn, readBaseline } from "./law/baseline.ts";
import { formatReport } from "./law/report.ts";
import { surveyProject } from "./law/project.ts";
import { misspelledIn } from "./law/misspelled.ts";
import { readConcessions } from "./law/concessions.ts";
import { knownRuleIds } from "./law/checks.ts";
import { isShape, type Adopted } from "./adopt/shapes.ts";
import {
  proposalFor,
  readAdopted,
  rememberProposal,
  withRule,
  writeAdopted,
} from "./adopt/store.ts";
import { proposeRule, ratify } from "./adopt/ratify.ts";
import { buildReport } from "./report/write.ts";
import { handle } from "./mcp.ts";
import { dispatchHook, registry } from "./registry.ts";
import { reasonFrom } from "./fields.ts";

function readPayload(): Payload {
  try {
    const text = readFileSync(0, "utf8");
    if (text.trim().length === 0) return { kind: "none" };
    return { kind: "text", text };
  } catch (cause) {
    const detail = reasonFrom(cause);
    console.error(`looper: could not read the hook payload (${detail}); passing`);
    return { kind: "none" };
  }
}

function readMessage(path: string | undefined): Payload {
  if (path === undefined) {
    console.error("looper: the commit-message check needs the message file; passing");
    return { kind: "none" };
  }
  try {
    return { kind: "text", text: readFileSync(path, "utf8") };
  } catch (cause) {
    const detail = reasonFrom(cause);
    console.error(`looper: could not read the commit message (${detail}); passing`);
    return { kind: "none" };
  }
}

function printReport(report: Report): void {
  const lines = ["looper init:"];
  for (const step of report.steps) lines.push(...describeStep(step));
  lines.push(
    "  looper's own rules are already in force. .looper/doctrine/constitution.md",
    "  is empty and costs nothing until you write a line; read the README beside",
    "  it to see what belongs there.",
  );
  console.log(lines.join("\n"));
}

function invocationFrom(args: readonly string[]): Invocation {
  if (args.includes("--dev")) return DEV;
  return reachedFrom(process.cwd());
}

function init(args: readonly string[]): number {
  printReport(runInit(process.cwd(), invocationFrom(args), searchPath()));
  return 0;
}

function currentAllocation(): Allocation {
  const run = allocate(registry(), {
    root: process.cwd(),
    budget: INJECTION_BUDGET,
  });
  for (const complaint of run.complaints) {
    console.error(
      `looper: ${complaint.capability} could not contribute (${complaint.detail}); continuing without it`,
    );
  }
  return run.allocation;
}

function inject(): number {
  const allocation = currentAllocation();
  if (allocation.text.length === 0) return 0;
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: allocation.text,
      },
    }),
  );
  return 0;
}

const DOCTRINE_PREFIX = "doctrine:";

function halvesOf(source: string): string {
  if (!source.startsWith(DOCTRINE_PREFIX)) return "";
  const name = source.slice(DOCTRINE_PREFIX.length);
  const canon = canonBranch(name);
  const mine = readProjectBranch(process.cwd(), name);
  const ours = canon.kind === "found" ? canon.body.length : 0;
  const yours = mine.kind === "present" ? mine.text.length : 0;
  if (yours === 0) return "   all of it looper's";
  if (ours === 0) return "   all of it yours";
  return `   looper ${ours}, yours ${yours}`;
}

function costLines(weighed: readonly Weighed[]): readonly string[] {
  return weighed.map(
    (held) => `    ${String(held.chars).padStart(6)}  ${held.source}${halvesOf(held.source)}`,
  );
}

function mapComplaints(): readonly string[] {
  const map = readMap(process.cwd());
  if (map.kind === "absent") return [];
  const tracked = trackedFiles(process.cwd());
  const files = tracked.kind === "unavailable" ? [] : tracked.paths;
  const said = unheardIn(map.governs, listBranches(process.cwd()), (globs) =>
    files.length === 0 || files.some((file) => globs.some((glob) => matches(glob, file))),
  );
  return said.map((held) => `  ${held.branch} governs nothing that arrives: ${held.why}`);
}

function status(): number {
  const allocation = currentAllocation();
  const outstanding = totalIn(readBaseline(process.cwd()));
  const lines = [
    `looper status`,
    `  injection budget   ${INJECTION_BUDGET} chars`,
    `  used this turn     ${allocation.chars} chars`,
    `  contributors`,
    ...costLines(allocation.weighed),
    `  dropped            ${describeList(allocation.dropped)}`,
    `  left to fix        ${outstanding === 0 ? "nothing" : `${outstanding} from before looper arrived`}`,
  ];
  const unheard = mapComplaints();
  if (unheard.length > 0) {
    lines.push(`  rule sets that will never arrive`, ...unheard);
  }
  if (allocation.overflowed) {
    lines.push(
      `  the first contributor alone is over budget, so it was kept and the ceiling exceeded`,
    );
  }
  console.log(lines.join("\n"));
  return 0;
}

function describeList(items: readonly string[]): string {
  if (items.length === 0) return "(none)";
  return items.join(", ");
}

function hook(args: readonly string[]): number {
  const name = args[0];
  if (name === undefined) {
    console.error("looper: hook needs an event name");
    return 2;
  }
  if (!isHookEvent(name)) {
    console.error(`looper: ${name} is not an event looper answers; passing`);
    return 0;
  }
  const result = dispatchHook(registry(), {
    root: process.cwd(),
    event: name,
    payload: name === "CommitMessage" ? readMessage(args[1]) : readPayload(),
  });
  for (const complaint of result.complaints) {
    console.error(
      `looper: ${complaint.capability} could not reach a verdict (${complaint.detail}); passing`,
    );
  }
  if (result.refusals.length > 0) {
    for (const refusal of result.refusals) console.error(refusal.reason);
    return 2;
  }
  for (const mention of result.mentions) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: name,
          additionalContext: mention.note,
        },
      }),
    );
  }
  return 0;
}

function serve(): number {
  const capabilities = registry();
  const root = process.cwd();
  const reader = createInterface({ input: process.stdin });
  reader.on("line", (line: string) => {
    if (line.trim().length === 0) return;
    const reply = handle(capabilities, root, line);
    if (reply.kind === "message") {
      process.stdout.write(`${reply.text}\n`);
      return;
    }
    if (reply.kind === "unreadable") {
      console.error(`looper: discarded a message it could not read (${reply.detail})`);
    }
  });
  return 0;
}

function law(asked: readonly string[]): number {
  for (const said of misspelledIn(readConcessions(process.cwd()), knownRuleIds())) {
    console.error(said);
  }
  const survey = surveyProject(process.cwd(), "everything", asked);
  for (const named of survey.unreadable) {
    console.error(`looper: could not read ${named}; it was not judged`);
  }
  const forgiven = totalIn(readBaseline(process.cwd()));
  if (survey.files === 0) {
    console.log(
      [
        "looper: there is nothing here the law can read.",
        "The law covers TypeScript and Rust. This is not a clean bill of health for",
        "the rest — the secrets gate, the rule sets and the staleness check all still",
        "apply to every file, and they are where looper earns its place in a project",
        "like this one.",
      ].join("\n"),
    );
    return 0;
  }
  if (survey.violations.length === 0) {
    if (survey.unreadable.length > 0) {
      console.log(
        `looper: ${survey.files} files, and nothing to fix in the ones it could read. ${survey.unreadable.length} could not be read, named above — those were not judged at all, which is not the same as being clean.`,
      );
      return 0;
    }
    console.log(`looper: ${survey.files} files, nothing to fix.`);
    return 0;
  }
  const older = Math.min(forgiven, survey.violations.length);
  const yours = survey.violations.length - older;
  console.log(formatReport(survey.violations, yours === 0 ? "all-older" : "some-new"));
  if (older > 0) {
    console.log(alreadyHere(older, yours));
  }
  return 2;
}

function alreadyHere(older: number, yours: number): string {
  const was = older === 1 ? "was" : "were";
  const all = yours === 0 ? "All " : "";
  return [
    `${all}${older} of these ${was} already here before looper arrived, and ${older === 1 ? "is" : "are"} recorded in .looper/baseline.toml.`,
    `${older === 1 ? "It does" : "They do"} not block a commit until you touch the line ${older === 1 ? "it is" : "they are"} on.`,
    yours === 0
      ? "Fix them when you are next in that file."
      : `The other ${yours} ${yours === 1 ? "is new and is" : "are new and are"} blocking.`,
  ].join(" ");
}

function saidOr(said: string | undefined, whenSilent: string): string {
  return said === undefined ? whenSilent : said;
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  if (at === -1) return undefined;
  return args[at + 1];
}

function proposalFrom(args: readonly string[]): Adopted | null {
  const shape = valueAfter(args, "--shape");
  const what = valueAfter(args, "--what");
  if (shape === undefined || what === undefined || !isShape(shape)) return null;
  return {
    shape,
    what,
    because: saidOr(valueAfter(args, "--because"), "adopted by this project"),
    instead: [saidOr(valueAfter(args, "--instead"), "there is no replacement recorded")],
    evidence: [],
  };
}

function adopt(args: readonly string[]): number {
  const root = process.cwd();
  const proposed = proposalFrom(args);
  if (proposed === null) {
    console.error(
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
      console.error(
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
    console.log(
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
    console.error(
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
    console.error(
      [
        `Not adopted. ${verdict.remaining.length} place(s) still break it:`,
        ...verdict.remaining.map((one) => `  ${one.file}:${one.line}`),
      ].join("\n"),
    );
    return 2;
  }

  writeAdopted(root, withRule(readAdopted(root), verdict.rule));
  console.log(
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

function report(args: readonly string[]): number {
  const ruleId = valueAfter(args, "--rule");
  const file = valueAfter(args, "--file");
  const line = valueAfter(args, "--line");
  const tried = valueAfter(args, "--tried");

  if (ruleId === undefined || file === undefined || line === undefined) {
    console.error(
      [
        "looper report says a rule of looper's own is wrong, without sending anything.",
        '  looper report --rule TS-ERROR:4 --file src/a.ts --line 12 --tried "what you tried"',
        "",
        "It writes a file describing the shape the rule fired on. Nothing from your",
        "code goes in it, and looper cannot send it anywhere — you decide what to do",
        "with the file.",
      ].join("\n"),
    );
    return 2;
  }

  const written = buildReport({
    root: process.cwd(),
    ruleId,
    file,
    line: Number(line),
    tried: saidOr(tried, "not stated"),
  });

  if (written.kind === "no-shape") {
    console.error(`looper: no report written — ${written.why}.`);
    return 2;
  }
  if (written.kind === "cannot-be-sure") {
    console.error(
      [
        "looper refused to write the report. What you typed into --tried is checked",
        "against every file in the project, and it could not read these:",
        ...written.unreadable.map((one) => `  ${one}`),
        "",
        "A file it could not read is a file it could not check against. Nothing was",
        "written.",
      ].join("\n"),
    );
    return 2;
  }
  if (written.kind === "would-leak") {
    console.error(
      [
        "looper refused to write the report, because it would have carried something",
        `from your code: ${written.leaks.map((one) => one.word).join(", ")}.`,
        "",
        "What you typed into --tried is checked word by word against your project.",
        "Say it without the names — the shape below the text is what a rule is argued",
        "with, and it carries no name at all.",
        "",
        "That is a bug in looper, not in your project. Nothing was written.",
      ].join("\n"),
    );
    return 2;
  }

  console.log(
    [
      `Written to ${written.path}.`,
      "",
      "Read it. Nothing from your code is in it and looper cannot send it anywhere.",
      "If you want us to see it, that is yours to do — open an issue and paste it,",
      "or have your agent do it with whatever it already uses.",
    ].join("\n"),
  );
  return 0;
}

function usage(): void {
  console.error(
    [
      "looper",
      "  looper init [--dev]     wire looper into this project",
      "  looper inject           the per-prompt injection hook",
      "  looper hook <event>     dispatch an agent hook",
      "  looper status           what looper injects, and what it costs per turn",
      "  looper serve            the MCP server, on stdin and stdout",
      "  looper law [path...]    judge every file, or only what is under these paths",
      "  looper adopt            propose a rule this project should follow",
      "  looper report           say a looper rule is wrong, without sending anything",
    ].join("\n"),
  );
}

function run(argv: readonly string[]): number {
  const command = argv[0];
  const rest = argv.slice(1);
  if (command === "init") return init(rest);
  if (command === "inject") return inject();
  if (command === "hook") return hook(rest);
  if (command === "status") return status();
  if (command === "serve") return serve();
  if (command === "law") return law(rest);
  if (command === "adopt") return adopt(rest);
  if (command === "report") return report(rest);
  usage();
  return 2;
}

process.exitCode = run(process.argv.slice(2));
