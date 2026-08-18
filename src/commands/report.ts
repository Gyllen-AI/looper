import type { Out } from "../out.ts";
import { buildReport } from "../report/write.ts";
import { saidOr, valueAfter } from "./args.ts";
import { here } from "../session.ts";

export function report(args: readonly string[], out: Out): number {
  const ruleId = valueAfter(args, "--rule");
  const file = valueAfter(args, "--file");
  const line = valueAfter(args, "--line");
  const tried = valueAfter(args, "--tried");

  if (ruleId.kind === "none" || file.kind === "none" || line.kind === "none") {
    out.warn(
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
    root: here(),
    ruleId: ruleId.value,
    file: file.value,
    line: Number(line.value),
    tried: saidOr(tried, "not stated"),
  });

  if (written.kind === "no-shape") {
    out.warn(`looper: no report written — ${written.why}.`);
    return 2;
  }
  if (written.kind === "cannot-be-sure") {
    out.warn(
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
    out.warn(
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

  out.say(
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
