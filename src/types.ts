export type Matcher =
  | { readonly kind: "all" }
  | { readonly kind: "match"; readonly pattern: string };

export type HookSpec = {
  readonly event: string;
  readonly matcher: Matcher;
  readonly command: string;
  readonly statusMessage: string;
  readonly timeoutSeconds?: number;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonObject;

export type JsonObject = { readonly [key: string]: JsonValue };

export type Existing =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly text: string };

export type Merge =
  | { readonly kind: "created"; readonly text: string; readonly wired: readonly string[] }
  | { readonly kind: "merged"; readonly text: string; readonly wired: readonly string[] }
  | { readonly kind: "unchanged" };
