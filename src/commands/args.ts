export type Given =
  | { readonly kind: "given"; readonly value: string }
  | { readonly kind: "none" };

export function valueAfter(args: readonly string[], flag: string): Given {
  const at = args.indexOf(flag);
  if (at === -1) return { kind: "none" };
  const held = args[at + 1];
  if (held === undefined) return { kind: "none" };
  return { kind: "given", value: held };
}

export function saidOr(given: Given, whenSilent: string): string {
  return given.kind === "given" ? given.value : whenSilent;
}
