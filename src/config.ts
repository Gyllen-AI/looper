import { delimiter } from "node:path";
import type { HookSpec } from "./types.ts";

export const SETTINGS_PATH = ".claude/settings.json";

export const JSON_INDENT = 2;

export const HOOK_ENTRY_TYPE = "command";

export const MATCHER_KEY = "matcher";

export const HOOKS_KEY = "hooks";

export const COMMAND_KEY = "command";

export const CONSTITUTION_PATH = ".looper/doctrine/constitution.md";

export const INJECTION_BUDGET = 9800;

export const HOOK_OUTPUT_CEILING = 10000;

export const INJECTION_SEPARATOR = "\n\n";

export const DOCTRINE_SEPARATOR = "\n\n";

export const CANON_DIR = "canon";

export const ROUTER_PRIORITY = 0;

export const BRANCH_PRIORITY = 10;

export const BASELINE_PRIORITY = 20;

export const MAP_PATH = ".looper/doctrine/map.toml";

export const DOCTRINE_DIR = ".looper/doctrine";

export const FRESHNESS_BYPASS = "Doctrine-freshness:";

export const FRESHNESS_SECTION = "freshness";

export const GOVERNS_SECTION = "governs";

export const DOCTRINE_README_PATH = ".looper/doctrine/README.md";

export const CONSTITUTION_STUB = "";

export const MAP_STUB = `# Ties each doctrine branch to the code it governs. A branch is injected only
# when the files this session has touched land in its area, which is what lets a
# large doctrine stay affordable.
#
# The name on the left is the branch: a file called <name>.md beside this one.
# The canon ships its own half under the same names, and yours is added to it.
#
# [governs]
# law = ["src/**/*.ts"]
# frontend = ["ui/**", "components/**"]

[governs]
`;

export const DOCTRINE_README_STUB = `# Your project's doctrine

looper injects \`constitution.md\` from this folder on every prompt, after the
rules it ships with. Branch files beside it load only when you touch the area
they govern, per \`map.toml\`.

**This README is never injected. Every other file here is, exactly as written,**
so nothing in them is free and there are no comments to hide notes in. Notes
belong here.

## constitution.md

The constitution is the rules that hold **no matter what you are working on**.
That is what the name means here, and it is why it is not named after a subject
the way the other files are: everything else in this folder loads only when you
touch the area it covers, and this one is read on every single message.

It starts empty on purpose, and empty costs nothing. looper already carries the
rules that are true for any project, so this file is only for what is true for
*yours*.

A line earns its place if the model would not already do it. Good lines sound
like:

    Money amounts are integers of the smallest unit. Never a float.
    Ask before changing anything a customer can see.

Lines that restate what it already does make it hedge more, not less:

    Write clean code.
    Be thorough.

Keep it short. Ten lines is a lot.

## Branch files

When a rule only matters while doing one kind of work, put it in a branch
instead, and map that branch to the files it governs. Name the file after the
branch: \`frontend.md\` for the \`frontend\` entry in \`map.toml\`.

A rule anchored to something that actually went wrong, with the date, is
followed. The same rule as a general principle is skimmed.
`;

export const LAW_PATH = "law.toml";

export const JUDGED_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".mts", ".cts", ".rs"];

export const RUST_EXTENSION = ".rs";

export const OUTSIDE_THE_LAW: readonly string[] = ["node_modules", "dist", ".git", "target", "vendor"];

export const RUST_ENGINE_DIR = "vendor/rust-law";

export const RUST_ENGINE_NAME = "looper-rust";

export const RUST_TIMEOUT_MS = 120_000;

export const HOOK_TIMEOUT_SECONDS = 30;

export const COMMIT_GATE_TIMEOUT_SECONDS = 300;

export const REPORT_PATH = ".looper/report.md";

export const REPORT_DEPTH = 6;

export const ADOPTED_PATH = ".looper/adopted.toml";

export const ADOPTING_PATH = ".looper/adopting.toml";

export const ADOPTED_HEADER = `# Rules this project adopted, and the evidence that earned each one.
#
# Nothing here was approved by opinion. A rule only landed once it caught real
# code in this project, every place it caught was rewritten, and the project
# still worked afterwards. The lines under evidence are where it used to happen.
#
# Delete an entry to drop the rule. It only ever blocked new code, so dropping
# one costs nothing already written.`;

export const RECALL_PATH = ".looper/recall.md";

export const RECALL_TOOL = "recall";

export const RECALL_PRIORITY = 30;

export const RECALL_HEADER = `# What this project has learned

Written by the agent, read by every future session. Committed on purpose: a note
nobody else can see is a note nobody can correct, and a wrong one is worse than
none because it is believed.

Delete an entry the moment it stops being true.`;

export const SECRETS_ALLOW_PATH = ".looper/secrets.allow";

export const ALLOW_MARKER = "looper:allow-secret";

export const SKIP_SUFFIXES: readonly string[] = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2",
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
];

export const BASELINE_PATH = ".looper/baseline.toml";

export const PRE_COMMIT = "pre-commit";

export const COMMIT_MSG = "commit-msg";

export const MESSAGE_MARKER = "looper hook CommitMessage";

export function commitMessageScript(entry: string): string {
  return [
    "#!/bin/sh",
    `${entry} hook CommitMessage "$1" </dev/null`,
    "verdict=$?",
    "if [ $verdict -eq 2 ]; then",
    "  exit 1",
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

export const HOOK_MARKER = "looper hook PreCommit";

export function gitHookEntryFor(invocation: Invocation): string {
  if (invocation.kind === "dev") return "node ./src/main.ts";
  if (invocation.kind === "local") return LOCAL_FROM_ROOT;
  if (invocation.kind === "inside") return `node ./${scriptUnder(invocation.at)}`;
  return INSTALLED_ENTRY;
}

export function preCommitScript(entry: string): string {
  return [
    "#!/bin/sh",
    `${entry} hook PreCommit </dev/null`,
    "verdict=$?",
    "if [ $verdict -eq 2 ]; then",
    "  exit 1",
    "fi",
    "if [ $verdict -ne 0 ]; then",
    '  echo "looper could not check this commit, so it was not checked." >&2',
    '  echo "  Nothing is wrong with your code as far as looper knows." >&2',
    "  exit 0",
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

export const BASELINE_HEADER = `# Problems that were already here when looper arrived. They are not forgiven and
# they are not exceptions: they are a list of work outstanding, and it can only
# get shorter. looper refuses any new problem, and any problem on a line you
# touch, so this shrinks wherever anyone does anything.
#
# Delete a line here once you have fixed it, or let looper shrink it for you.`;

export const NOT_A_WAY_THROUGH = `Asking a person to run this command instead is not a way through: the same rules apply to their commit. If the rule is wrong here, run \`looper report\` — it writes the case for changing it, and CONTRIBUTING.md has the three routes out.`;

export const TS_SECTION = "ts";

export const SHARED_TRUTH_SECTION = "truth";

export const ENTRY_SECTION = "entry";

export const SANCTUM_DEFAULT = "config.ts";

export const TRACE_SYMBOLS: readonly string[] = [
  "logger.warn",
  "logger.error",
  "logger.fatal",
];

export const SUPPRESSIONS: readonly string[] = [
  "@ts-ignore",
  "@ts-expect-error",
  "@ts-nocheck",
  "eslint-disable",
];

export const MAX_LOC_DEFAULT = 500;

export const GIT_TIMEOUT_MS = 3000;

export const SERVER_NAME = "looper";

export const SERVER_VERSION = "0.0.0";

export const JSONRPC_VERSION = "2.0";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const DOCTRINE_TOOL = "doctrine";

export const MCP_PATH = ".mcp.json";

export type Launch = { readonly command: string; readonly args: readonly string[] };

export function launchFor(invocation: Invocation): Launch {
  if (invocation.kind === "dev") {
    return { command: "node", args: [`${DEV_SCRIPT}`] };
  }
  if (invocation.kind === "local") {
    return { command: LOCAL_FROM_ROOT, args: [] };
  }
  if (invocation.kind === "inside") {
    return { command: "node", args: [`$CLAUDE_PROJECT_DIR/${scriptUnder(invocation.at)}`] };
  }
  return { command: INSTALLED_ENTRY, args: [] };
}

export function mcpStub(invocation: Invocation): string {
  const launch = launchFor(invocation);
  return `${JSON.stringify(
    {
      mcpServers: {
        looper: {
          type: "stdio",
          command: launch.command,
          args: [...launch.args, "serve"],
        },
      },
    },
    null,
    2,
  )}\n`;
}

export function branchHeading(name: string): string {
  return `— doctrine · ${name} —`;
}

export const TEMP_SUFFIX = ".looper-tmp";

export const BACKUP_SUFFIX = ".looper-backup";

export const EDIT_TOOLS = "Edit|MultiEdit|Write";

export type Invocation =
  | { readonly kind: "installed" }
  | { readonly kind: "local" }
  | { readonly kind: "dev" }
  | { readonly kind: "inside"; readonly at: string };

export const INSTALLED: Invocation = { kind: "installed" };

export const LOCAL: Invocation = { kind: "local" };

export const DEV: Invocation = { kind: "dev" };

export function inside(at: string): Invocation {
  return { kind: "inside", at };
}

const DEV_SCRIPT = "$CLAUDE_PROJECT_DIR/src/main.ts";

const INSTALLED_ENTRY = "looper";

export const LOOPER_COMMAND = INSTALLED_ENTRY;

export const DEV_ENTRY = "src/main.ts";

export function searchPath(): readonly string[] {
  const written = process.env["PATH"];
  if (written === undefined) return [];
  return written.split(delimiter);
}

const LOCAL_ENTRY = "$CLAUDE_PROJECT_DIR/node_modules/.bin/looper";

const LOCAL_FROM_ROOT = "./node_modules/.bin/looper";

export const LOCAL_BIN = "node_modules/.bin/looper";

export const SHIM = "bin/looper.js";

export function scriptUnder(at: string): string {
  return `${at}/${SHIM}`;
}

export function entryFor(invocation: Invocation): string {
  if (invocation.kind === "dev") return `node "${DEV_SCRIPT}"`;
  if (invocation.kind === "local") return `"${LOCAL_ENTRY}"`;
  if (invocation.kind === "inside") {
    return `node "$CLAUDE_PROJECT_DIR/${scriptUnder(invocation.at)}"`;
  }
  return INSTALLED_ENTRY;
}

export function looperHooks(invocation: Invocation): readonly HookSpec[] {
  const entry = entryFor(invocation);
  return [
    {
      event: "UserPromptSubmit",
      matcher: { kind: "all" },
      command: `${entry} inject`,
      statusMessage: "looper: reading this project's rules",
    },
    {
      event: "PostToolUse",
      matcher: { kind: "match", pattern: EDIT_TOOLS },
      command: `${entry} hook PostToolUse`,
      statusMessage: "looper: checking that edit",
    },
    {
      event: "PreToolUse",
      matcher: { kind: "match", pattern: "Bash" },
      command: `${entry} hook PreToolUse`,
      statusMessage: "looper: checking what is about to be committed",
      timeoutSeconds: COMMIT_GATE_TIMEOUT_SECONDS,
    },
    {
      event: "Stop",
      matcher: { kind: "all" },
      command: `${entry} hook Stop`,
      statusMessage: "looper: updating what is left to fix",
    },
  ];
}
