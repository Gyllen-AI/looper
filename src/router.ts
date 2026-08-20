import { BRANCH_PRIORITY, DOCTRINE_TOOL, ROUTER_PRIORITY } from "./config.ts";
import {
  assembleBranch,
  assembleConstitution,
  branchIndex,
  listBranches,
  readProjectConstitution,
} from "./doctrine.ts";
import { pathsInHand } from "./git.ts";
import { branchesFor, readMap, withCanonDefaults } from "./map.ts";
import { canonGoverns } from "./canon.ts";
import { freshnessOf, saidAbout } from "./freshness.ts";
import { saidAboutSize, sizeOfStaged } from "./size.ts";
import {
  SILENT,
  type Capability,
  type HookEvent,
  type InHand,
  type InjectContext,
  type Injection,
  type Outcome,
  type ToolCall,
  type ToolDef,
  type ToolResult,
} from "./capability.ts";

const FRESHNESS_EVENTS: readonly HookEvent[] = ["CommitMessage"];

const NO_BRANCHES: readonly string[] = [];

const A_HEADING = /^\s*(—|#)/;
const A_SENTENCE = /^(.*?[.!?])(\s|$)/;

function firstSentenceOf(text: string): string {
  const gathered: string[] = [];
  for (const line of text.split("\n")) {
    const said = line.trim();
    if (said.length === 0 || A_HEADING.test(said)) {
      if (gathered.length > 0) break;
      continue;
    }
    gathered.push(said.replace(/^[-*]\s+/, "").replace(/\*\*/g, ""));
    const ended = A_SENTENCE.exec(gathered.join(" "));
    const sentence = ended === null ? undefined : ended[1];
    if (sentence !== undefined) return sentence;
  }
  return gathered.join(" ").slice(0, 90);
}

const EMPTY_MAP: ReadonlyMap<string, readonly string[]> = new Map();

export class Router implements Capability {
  readonly name = "router";

  inject(context: InjectContext): readonly Injection[] {
    const constitution = assembleConstitution(readProjectConstitution(context.root));
    const index = branchIndex(context.root);
    const injections: Injection[] = [
      {
        source: this.name,
        priority: ROUTER_PRIORITY,
        text: `${constitution.text}\n\n${index}`,
        required: true,
        notice: false,
      },
    ];

    const unreachable = this.unreachable(context.root, context.turn.inHand);
    if (unreachable.length > 0) {
      injections.push({
        source: this.name,
        priority: ROUTER_PRIORITY,
        text: unreachable,
        required: true,
        notice: false,
      });
    }

    let raisedFirst = true;
    for (const name of this.signalledBy(context.root, context.turn.inHand)) {
      const branch = assembleBranch(context.root, name);
      if (branch.kind === "nowhere") continue;
      injections.push({
        source: `doctrine:${name}`,
        priority: BRANCH_PRIORITY,
        text: branch.text,
        required: raisedFirst,
        notice: false,
        summary: firstSentenceOf(branch.text),
      });
      raisedFirst = false;
    }

    return injections;
  }

  unreachable(root: string, inHand: InHand): string {
    if (inHand.kind === "given") return "";
    const held = pathsInHand(root);
    if (held.kind !== "unavailable") return "";
    return `looper: the rule sets tied to what you are editing were not loaded (${held.detail}). Only the constitution below is in force, which is a fraction of this project's rules.`;
  }

  signalled(root: string): readonly string[] {
    return this.signalledBy(root, { kind: "from-git" });
  }

  signalledBy(root: string, inHand: InHand): readonly string[] {
    const map = readMap(root);
    const project = map.kind === "absent" ? EMPTY_MAP : map.governs;
    const own = new Set(project.keys());
    const governs = withCanonDefaults(project, canonGoverns());
    if (inHand.kind === "given") return branchesFor(governs, inHand.paths, own);
    const held = pathsInHand(root);
    if (held.kind === "unavailable") return NO_BRANCHES;
    return branchesFor(governs, held.paths, own);
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
    const grown = sizeOfStaged(context.root);
    if (grown.kind === "unavailable") {
      return {
        kind: "mention",
        note: `looper: the rule sets were not measured (${grown.detail}).`,
      };
    }
    if (grown.oversized.length > 0) return { kind: "block", reason: saidAboutSize(grown.oversized) };
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return [
      {
        name: DOCTRINE_TOOL,
        description:
          "Read a rule set by name: the rules looper ships plus this project's own, merged. Call with no argument to list what is available. The sets tied to the files you are editing arrive on their own; before editing in another area, pull its set. A question needs none.",
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
