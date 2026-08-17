import {
  COMMAND_KEY,
  SERVER_NAME,
  HOOKS_KEY,
  HOOK_ENTRY_TYPE,
  HOOK_TIMEOUT_SECONDS,
  JSON_INDENT,
  MATCHER_KEY,
  SETTINGS_PATH,
} from "./config.ts";
import { reasonFrom } from "./fields.ts";
import {
  HookGroupsNotAnArray,
  SettingsNotAnObject,
  SettingsUnparseable,
} from "./errors.ts";
import type { Launch } from "./config.ts";
import type {
  Existing,
  HookSpec,
  JsonObject,
  JsonValue,
  Matcher,
  Merge,
} from "./types.ts";

const NO_GROUPS: readonly JsonValue[] = [];

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "list";
  return typeof value;
}

function parseSettings(text: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    const detail = reasonFrom(cause);
    throw new SettingsUnparseable(SETTINGS_PATH, detail);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SettingsNotAnObject(SETTINGS_PATH, describe(value));
  }
  const object: JsonObject = { ...value };
  return object;
}

function matcherOf(group: JsonObject): Matcher {
  const written = group[MATCHER_KEY];
  if (typeof written === "string") {
    return { kind: "match", pattern: written };
  }
  return { kind: "all" };
}

function sameMatcher(left: Matcher, right: Matcher): boolean {
  if (left.kind === "all" && right.kind === "all") return true;
  if (left.kind === "match" && right.kind === "match") {
    return left.pattern === right.pattern;
  }
  return false;
}

function eventGroups(root: JsonObject, event: string): readonly JsonValue[] {
  const hooks = root[HOOKS_KEY];
  if (!isJsonObject(hooks)) return NO_GROUPS;
  const groups = hooks[event];
  if (groups === undefined) return NO_GROUPS;
  if (!isJsonArray(groups)) throw new HookGroupsNotAnArray(SETTINGS_PATH, event);
  return groups;
}

function carriesCommand(groups: readonly JsonValue[], command: string): boolean {
  return groups.some((group) => {
    if (!isJsonObject(group)) return false;
    const entries = group[HOOKS_KEY];
    if (!isJsonArray(entries)) return false;
    return entries.some(
      (entry) => isJsonObject(entry) && entry[COMMAND_KEY] === command,
    );
  });
}

function entryFor(spec: HookSpec): JsonObject {
  return {
    type: HOOK_ENTRY_TYPE,
    command: spec.command,
    timeout: spec.timeoutSeconds === undefined ? HOOK_TIMEOUT_SECONDS : spec.timeoutSeconds,
    statusMessage: spec.statusMessage,
  };
}

function groupFor(spec: HookSpec): JsonObject {
  if (spec.matcher.kind === "all") {
    return { hooks: [entryFor(spec)] };
  }
  return { matcher: spec.matcher.pattern, hooks: [entryFor(spec)] };
}

function withEntryAppended(group: JsonObject, spec: HookSpec): JsonObject {
  const entries = group[HOOKS_KEY];
  if (!isJsonArray(entries)) return { ...group, hooks: [entryFor(spec)] };
  return { ...group, hooks: [...entries, entryFor(spec)] };
}

function placedInGroups(
  groups: readonly JsonValue[],
  spec: HookSpec,
): readonly JsonValue[] {
  let landed = false;
  const next = groups.map((group) => {
    if (landed || !isJsonObject(group)) return group;
    if (!sameMatcher(matcherOf(group), spec.matcher)) return group;
    landed = true;
    return withEntryAppended(group, spec);
  });
  if (landed) return next;
  return [...next, groupFor(spec)];
}

function withHookWired(root: JsonObject, spec: HookSpec): JsonObject {
  const groups = placedInGroups(eventGroups(root, spec.event), spec);
  const existingHooks = root[HOOKS_KEY];
  const hooks: JsonObject = isJsonObject(existingHooks) ? existingHooks : {};
  return { ...root, hooks: { ...hooks, [spec.event]: groups } };
}

function serialise(root: JsonObject): string {
  return `${JSON.stringify(root, null, JSON_INDENT)}\n`;
}

const SERVERS_KEY = "mcpServers";

export type McpMerge =
  | { readonly kind: "unchanged" }
  | { readonly kind: "created"; readonly text: string }
  | { readonly kind: "merged"; readonly text: string }
  | { readonly kind: "unreadable"; readonly why: string };

function serverEntry(launch: Launch): JsonObject {
  return {
    type: "stdio",
    command: launch.command,
    args: [...launch.args, "serve"],
  };
}

export function mergeMcp(existing: Existing, launch: Launch): McpMerge {
  const only = { [SERVERS_KEY]: { [SERVER_NAME]: serverEntry(launch) } };
  if (existing.kind === "absent") return { kind: "created", text: serialise(only) };

  let value: unknown;
  try {
    value = JSON.parse(existing.text);
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "unreadable", why: `it holds a ${describe(value)} rather than an object` };
  }

  const root: JsonObject = { ...value };
  const written = root[SERVERS_KEY];
  const servers: JsonObject = isJsonObject(written) ? written : {};
  if (servers[SERVER_NAME] !== undefined) return { kind: "unchanged" };

  return {
    kind: "merged",
    text: serialise({ ...root, [SERVERS_KEY]: { ...servers, [SERVER_NAME]: serverEntry(launch) } }),
  };
}

export function mergeSettings(
  existing: Existing,
  wanted: readonly HookSpec[],
): Merge {
  const startedEmpty = existing.kind === "absent";
  let root: JsonObject = startedEmpty ? {} : parseSettings(existing.text);

  const wired: string[] = [];
  for (const spec of wanted) {
    if (carriesCommand(eventGroups(root, spec.event), spec.command)) continue;
    root = withHookWired(root, spec);
    wired.push(spec.command);
  }

  if (wired.length === 0) return { kind: "unchanged" };
  if (startedEmpty) return { kind: "created", text: serialise(root), wired };
  return { kind: "merged", text: serialise(root), wired };
}
