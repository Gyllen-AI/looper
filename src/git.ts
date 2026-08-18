import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { GIT_TIMEOUT_MS } from "./config.ts";
import { reasonFrom } from "./fields.ts";

const CHANGED: readonly (readonly string[])[] = [
  ["diff", "HEAD", "--name-only", "--no-renames"],
  ["ls-files", "--others", "--exclude-standard"],
  ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
];

export type Changed =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "paths"; readonly paths: readonly string[] };

function ask(root: string, args: readonly string[]): readonly string[] {
  const output = execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return output.split("\n").filter((line) => line.length > 0);
}

export type Staged =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "files"; readonly paths: readonly string[] };

export type StagedText =
  | { readonly kind: "unreadable"; readonly detail: string }
  | { readonly kind: "text"; readonly text: string };

export type HooksDir =
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "default"; readonly path: string }
  | { readonly kind: "declared"; readonly path: string };

export function hooksDirectory(root: string): HooksDir {
  try {
    const declared = ask(root, ["config", "--get", "core.hooksPath"]);
    const named = declared[0];
    if (named !== undefined && named.length > 0) {
      return { kind: "declared", path: named };
    }
  } catch (cause) {
    const detail = reasonFrom(cause);
    if (!existsSync(join(root, ".git"))) return { kind: "none", why: detail };
  }
  if (!existsSync(join(root, ".git"))) {
    return { kind: "none", why: "this is not a git repository" };
  }
  return { kind: "default", path: ".git/hooks" };
}

export function trackedFiles(root: string): Staged {
  try {
    return { kind: "files", paths: ask(root, ["ls-files"]) };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unavailable", detail };
  }
}

export type Ignoring =
  | { readonly kind: "unavailable"; readonly detail: string }
  | { readonly kind: "ignoring"; readonly paths: ReadonlySet<string>; readonly folders: readonly string[] };

const IGNORED: readonly string[] = [
  "ls-files",
  "--others",
  "--ignored",
  "--exclude-standard",
  "--directory",
];

export function ignoredHere(root: string): Ignoring {
  if (!existsSync(join(root, ".git"))) {
    return { kind: "unavailable", detail: "this is not a git repository" };
  }
  try {
    const said = ask(root, IGNORED);
    const paths = new Set<string>();
    const folders: string[] = [];
    for (const line of said) {
      if (line.endsWith("/")) folders.push(line);
      else paths.add(line);
    }
    return { kind: "ignoring", paths, folders };
  } catch (cause) {
    return { kind: "unavailable", detail: reasonFrom(cause) };
  }
}

export type AddedLine = {
  readonly file: string;
  readonly line: number;
  readonly text: string;
};

export type Added =
  | { readonly kind: "unavailable"; readonly why: string }
  | { readonly kind: "lines"; readonly added: readonly AddedLine[] };

const FILE_HEADER = /^\+\+\+ b\/(.*)$/;

const HUNK_START = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function stagedAdditions(root: string): Added {
  try {
    const diff = ask(root, ["diff", "--cached", "-U0", "--no-color"]);
    const added: AddedLine[] = [];
    let file = "(staged change)";
    let at = 0;

    for (const line of diff) {
      const header = FILE_HEADER.exec(line);
      if (header !== null) {
        const named = header[1];
        if (named !== undefined) file = named;
        continue;
      }
      const hunk = HUNK_START.exec(line);
      if (hunk !== null) {
        at = Number(hunk[1]);
        continue;
      }
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      added.push({ file, line: at, text: line.slice(1) });
      at += 1;
    }
    return { kind: "lines", added };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unavailable", why: detail };
  }
}

export function stagedFiles(root: string): Staged {
  try {
    return {
      kind: "files",
      paths: ask(root, ["diff", "--cached", "--name-only", "--diff-filter=ACM"]),
    };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unavailable", detail };
  }
}

export function stagedText(root: string, path: string): StagedText {
  try {
    return { kind: "text", text: ask(root, ["show", `:${path}`]).join("\n") };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unreadable", detail };
  }
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export type Touched =
  | { readonly kind: "unknown"; readonly why: string }
  | { readonly kind: "lines"; readonly lines: ReadonlySet<number> };

export type Against = "index" | "commit";

export function stagedLines(root: string, path: string): Touched {
  return changedLines(root, path, "index");
}

export function changedLines(root: string, path: string, against: Against): Touched {
  const scope = against === "index" ? ["--cached"] : [];
  try {
    const diff = ask(root, ["diff", ...scope, "-U0", "--", path]);
    const lines = new Set<number>();
    for (const line of diff) {
      const hunk = HUNK.exec(line);
      if (hunk === null) continue;
      const from = Number(hunk[1]);
      const span = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let at = from; at < from + span; at += 1) lines.add(at);
    }
    return { kind: "lines", lines };
  } catch (cause) {
    const detail = reasonFrom(cause);
    return { kind: "unknown", why: detail };
  }
}

export function changedPaths(root: string): Changed {
  const seen = new Set<string>();
  for (const args of CHANGED) {
    try {
      for (const path of ask(root, args)) seen.add(path);
    } catch (cause) {
      const detail = reasonFrom(cause);
      return { kind: "unavailable", detail };
    }
  }
  return { kind: "paths", paths: [...seen] };
}
