import { SILENT } from "../capability.ts";
import type {
  Capability,
  HookContext,
  HookEvent,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import { stagedPins } from "../git.ts";
import { judge, reportOn, unsettled } from "./judge.ts";

const AT_COMMIT: readonly HookEvent[] = ["PreCommit"];

const NO_TOOLS: readonly ToolDef[] = [];

export class Pins implements Capability {
  readonly name = "pins";

  inject(): readonly Injection[] {
    return SILENT;
  }

  hooks(): readonly HookEvent[] {
    return AT_COMMIT;
  }

  onHook(context: HookContext): Outcome {
    const staged = stagedPins(context.root);
    if (staged.kind === "unavailable") {
      return {
        kind: "block",
        reason: `looper: the staged changes could not be read, so a submodule pin moving in them could not be checked (${staged.detail})`,
      };
    }
    if (staged.moved.length === 0) return { kind: "pass" };
    const doubtful = unsettled(judge(context.root, staged.moved));
    if (doubtful.length === 0) return { kind: "pass" };
    return { kind: "block", reason: reportOn(doubtful) };
  }

  tools(): readonly ToolDef[] {
    return NO_TOOLS;
  }

  call(request: ToolCall): ToolResult {
    return { kind: "unknown-tool", asked: request.tool };
  }
}
