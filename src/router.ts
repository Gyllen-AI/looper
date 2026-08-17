import { BRANCH_PRIORITY, DOCTRINE_TOOL, ROUTER_PRIORITY } from "./config.ts";
import {
  assembleBranch,
  assembleConstitution,
  listBranches,
  readProjectConstitution,
} from "./doctrine.ts";
import { changedPaths } from "./git.ts";
import { branchesFor, readMap } from "./map.ts";
import { freshnessOf, saidAbout } from "./freshness.ts";
import {
  SILENT,
  type Capability,
  type HookEvent,
  type InjectContext,
  type Injection,
  type Outcome,
  type ToolCall,
  type ToolDef,
  type ToolResult,
} from "./capability.ts";

const FRESHNESS_EVENTS: readonly HookEvent[] = ["CommitMessage"];

const NO_BRANCHES: readonly string[] = [];

export class Router implements Capability {
  readonly name = "router";

  inject(context: InjectContext): readonly Injection[] {
    const constitution = assembleConstitution(readProjectConstitution(context.root));
    const injections: Injection[] = [
      {
        source: this.name,
        priority: ROUTER_PRIORITY,
        text: constitution.text,
      },
    ];

    for (const name of this.signalled(context.root)) {
      const branch = assembleBranch(context.root, name);
      if (branch.kind === "nowhere") continue;
      injections.push({
        source: `doctrine:${name}`,
        priority: BRANCH_PRIORITY,
        text: branch.text,
      });
    }

    return injections;
  }

  signalled(root: string): readonly string[] {
    const map = readMap(root);
    if (map.kind === "absent") return NO_BRANCHES;
    const changed = changedPaths(root);
    if (changed.kind === "unavailable") return NO_BRANCHES;
    return branchesFor(map.governs, changed.paths);
  }

  hooks(): readonly HookEvent[] {
    return FRESHNESS_EVENTS;
  }

  onHook(context: HookContext): Outcome {
    if (context.event !== "CommitMessage") return { kind: "pass" };
    if (context.payload.kind === "none") return { kind: "pass" };

    const verdict = freshnessOf(context.root, context.payload.text);
    if (verdict.kind === "stale") return { kind: "block", reason: saidAbout(verdict.stale) };
    if (verdict.kind === "unavailable") {
      return {
        kind: "mention",
        note: `looper: the rule sets were not checked for staleness (${verdict.detail}).`,
      };
    }
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return [
      {
        name: DOCTRINE_TOOL,
        description:
          "Read a rule set by name: the rules looper ships plus this project's own, merged. Call with no argument to list what is available. Before starting a task, pull every set that touches it — the ones tied to files you edit arrive on their own, and the rest only arrive if you ask.",
        inputSchema: {
          type: "object",
          properties: {
            branch: {
              type: "string",
              description: "which set to read; omit to list them",
            },
          },
        },
      },
    ];
  }

  call(request: ToolCall): ToolResult {
    if (request.tool !== DOCTRINE_TOOL) {
      return { kind: "unknown-tool", asked: request.tool };
    }
    const available = listBranches(request.root);
    const asked = request.args.get("branch");
    if (asked === undefined) {
      return { kind: "text", text: `available: ${available.join(", ")}` };
    }
    const branch = assembleBranch(request.root, asked);
    if (branch.kind === "nowhere") {
      return {
        kind: "text",
        text: `there is no rule set called "${asked}". available: ${available.join(", ")}`,
      };
    }
    return { kind: "text", text: branch.text };
  }
}

export const NOTHING: readonly Injection[] = SILENT;
