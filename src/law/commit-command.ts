const SEPARATORS = /&&|\|\||;|\||\n/;

const GIT = "git";

const COMMIT = "commit";

const TAKES_A_VALUE: readonly string[] = ["-C", "-c", "--git-dir", "--work-tree"];

export type Intent =
  | { readonly kind: "other" }
  | { readonly kind: "commit" };

function words(segment: string): readonly string[] {
  return segment.trim().split(/\s+/).filter((word) => word.length > 0);
}

function subcommandOf(segment: string): string | null {
  const parts = words(segment);
  let at = 0;

  while (at < parts.length) {
    const word = parts[at];
    if (word === undefined) return null;
    if (word.includes("=") && !word.startsWith("-")) {
      at += 1;
      continue;
    }
    break;
  }

  if (parts[at] !== GIT) return null;
  at += 1;

  while (at < parts.length) {
    const word = parts[at];
    if (word === undefined) return null;
    if (!word.startsWith("-")) return word;
    if (TAKES_A_VALUE.includes(word)) {
      at += 2;
      continue;
    }
    at += 1;
  }
  return null;
}

export function intentOf(command: string): Intent {
  for (const segment of command.split(SEPARATORS)) {
    if (subcommandOf(segment) === COMMIT) return { kind: "commit" };
  }
  return { kind: "other" };
}
