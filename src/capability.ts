export type HookEvent =
  | "PostToolUse"
  | "PreToolUse"
  | "Stop"
  | "PreCommit"
  | "CommitMessage";

export type Payload =
  | { readonly kind: "none" }
  | { readonly kind: "text"; readonly text: string };

export type Injection = {
  readonly source: string;
  readonly priority: number;
  readonly text: string;
  readonly required: boolean;
};

export type Outcome =
  | { readonly kind: "pass" }
  | { readonly kind: "mention"; readonly note: string }
  | { readonly kind: "block"; readonly reason: string };

export type InjectContext = {
  readonly root: string;
  readonly budget: number;
};

export type HookContext = {
  readonly root: string;
  readonly event: HookEvent;
  readonly payload: Payload;
};

export type ToolDef = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
};

export type Shown = { readonly media: string; readonly base64: string };

export type ToolResult =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "shown"; readonly said: string; readonly images: readonly Shown[] }
  | { readonly kind: "unknown-tool"; readonly asked: string };

export type ToolCall = {
  readonly root: string;
  readonly tool: string;
  readonly args: ReadonlyMap<string, string>;
};

export interface Capability {
  readonly name: string;
  inject(context: InjectContext): readonly Injection[];
  hooks(): readonly HookEvent[];
  onHook(context: HookContext): Outcome;
  tools(): readonly ToolDef[];
  call(request: ToolCall): ToolResult;
}

export const SILENT: readonly Injection[] = [];

export function isHookEvent(name: string): name is HookEvent {
  return (
    name === "PostToolUse" ||
    name === "PreToolUse" ||
    name === "Stop" ||
    name === "PreCommit" ||
    name === "CommitMessage"
  );
}
