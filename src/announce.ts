import type { Step } from "./init.ts";

export function describeStep(step: Step): readonly string[] {
  if (step.kind === "created") {
    return [
      `  created  ${step.path}`,
      ...step.wired.map((command) => `             wired  ${command}`),
    ];
  }
  if (step.kind === "merged") {
    const backup =
      step.backup.kind === "kept"
        ? [`             your previous version is kept at ${step.backup.path}`]
        : [];
    return [
      `  merged   ${step.path} (everything already in it was left alone)`,
      ...step.wired.map((command) => `             wired  ${command}`),
      ...backup,
    ];
  }
  if (step.kind === "gate-wired") return [`  created  ${step.path}`];
  if (step.kind === "gate-already") {
    return [`  the ${step.hook} check was already in place`];
  }
  if (step.kind === "gate-yours") {
    return [
      `  you already have your own ${step.path}, which was left alone.`,
      `           That check is NOT running until you add this line to it:`,
      `             ${step.line}`,
    ];
  }
  if (step.kind === "gate-impossible") {
    return [`  no ${step.hook} check: ${step.why}`];
  }
  if (step.kind === "surveyed-clean") {
    return [`  read every file (${step.files}) and found nothing to fix.`];
  }
  if (step.kind === "surveyed") {
    return [
      `  read every file (${step.files}) and found ${step.outstanding} things worth fixing.`,
      `           They are listed in ${step.path} as work outstanding, not as`,
      `           exceptions. Nothing is blocked because of them: looper refuses`,
      `           only new problems, and problems on a line you touch, so the list`,
      `           gets shorter wherever anyone works. Run \`looper law\` to read it.`,
    ];
  }
  if (step.kind === "mcp-unreadable") {
    return [
      `  ${step.path} could not be read (${step.why}), so it was left exactly as it is.`,
      `           looper's tools are NOT available until this block is in it:`,
      ...step.block.split("\n").map((line) => `             ${line}`),
    ];
  }
  if (step.kind === "entry-unreachable") {
    return [
      `  the hooks are written and the command they run cannot be found: ${step.what}.`,
      `           Nothing is being checked until that resolves. Install looper in`,
      `           this project (npm install --save-dev github:gyllen-ai/looper)`,
      `           and run looper init again.`,
    ];
  }
  if (step.kind === "scaffolded") return [`  created  ${step.path}`];
  if (step.kind === "yours-already") {
    return [`  yours already, left alone  ${step.path}`];
  }
  return [`  already wired, nothing to change  ${step.path}`];
}
