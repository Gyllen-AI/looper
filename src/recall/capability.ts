import { RECALL_PRIORITY, RECALL_TOOL } from "../config.ts";
import { SILENT } from "../capability.ts";
import type {
  Capability,
  HookEvent,
  InjectContext,
  Injection,
  Outcome,
  ToolCall,
  ToolDef,
  ToolResult,
} from "../capability.ts";
import { forget, matching, readNotes, remember, type Note } from "./store.ts";
import { asked, mostRelevant } from "./relevance.ts";
import { pathsInHand } from "../git.ts";

const NO_EVENTS: readonly HookEvent[] = [];

const DESCRIPTION = [
  "What this project has learned, kept between sessions.",
  "",
  "Call with no argument to read everything, or with {\"about\":\"...\"} to find matching notes.",
  "Write one with {\"summary\":\"...\",\"note\":\"...\"}. Writing the same summary again replaces it,",
  "which is how a note gets corrected rather than duplicated. Remove one with {\"forget\":\"...\"}.",
  "",
  "What earns a place: something that took work to find out and is not written",
  "anywhere else — why an approach was abandoned, how something actually behaves",
  "as opposed to what its documentation says, which failure turned out to be a",
  "red herring. Measured facts keep the number and what produced it, or they",
  "decay into folklore.",
  "",
  "What does not: anything the code, the tests or the git history already say.",
  "A version number or a file path, which goes stale silently. And a single",
  "session's stumble written as a permanent law, which makes every later session",
  "steer around a pothole that was filled months ago. A note earns its place by",
  "helping the next session, not by having surprised the last one.",
].join("\n");

function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function listed(notes: readonly Note[]): string {
  return notes
    .map((note) => `## ${note.learned} — ${note.summary}\n${note.body}`)
    .join("\n\n");
}

function inHandPaths(context: InjectContext): readonly string[] {
  const inHand = context.turn.inHand;
  if (inHand.kind === "given") return inHand.paths;
  const held = pathsInHand(context.root);
  return held.kind === "paths" ? held.paths : [];
}

export class Recall implements Capability {
  readonly name = "recall";

  inject(context: InjectContext): readonly Injection[] {
    const notes = readNotes(context.root);
    if (notes.length === 0) return SILENT;
    const hits = mostRelevant(notes, asked(context.turn.prompt, inHandPaths(context)));
    if (hits.length === 0) {
      return [
        {
          source: this.name,
          priority: RECALL_PRIORITY,
          required: false,
          notice: true,
          text: `looper: this project has written down ${notes.length} thing(s) it worked out before. When a topic comes up, ask the \`recall\` tool by name; nothing here matched this prompt.`,
        },
      ];
    }
    return [
      {
        source: this.name,
        priority: RECALL_PRIORITY,
        required: false,
        notice: true,
        text: `looper: ${hits.length} of this project's ${notes.length} notes touch what you asked:\n${hits.map((one) => `  ${one.summary}`).join("\n")}\nRead one with the \`recall\` tool before working it out again.`,
      },
    ];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }

  tools(): readonly ToolDef[] {
    return [
      {
        name: RECALL_TOOL,
        description: DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "one line naming what was learned" },
            note: { type: "string", description: "the detail, with the evidence" },
            about: { type: "string", description: "read only notes mentioning this" },
            forget: { type: "string", description: "remove the note with this summary" },
          },
        },
      },
    ];
  }

  call(request: ToolCall): ToolResult {
    if (request.tool !== RECALL_TOOL) {
      return { kind: "unknown-tool", asked: request.tool };
    }

    const dropping = request.args.get("forget");
    if (dropping !== undefined) {
      const gone = forget(request.root, dropping);
      if (gone.kind === "busy") {
        return {
          kind: "text",
          text: `looper could not remove that note: ${gone.why}. Nothing was changed — try again.`,
        };
      }
      return {
        kind: "text",
        text:
          gone.kind === "gone"
            ? `forgotten: ${dropping}`
            : `there is no note called "${dropping}".`,
      };
    }

    const summary = request.args.get("summary");
    const body = request.args.get("note");
    if (summary !== undefined && body !== undefined) {
      const written = remember(request.root, {
        learned: today(),
        summary,
        body,
      });
      if (written.kind === "busy") {
        return {
          kind: "text",
          text: `looper did not write that note: ${written.why}. Nothing was lost and nothing was written — say it again.`,
        };
      }
      const verb = written.kind === "replaced" ? "corrected" : "remembered";
      return { kind: "text", text: `${verb}: ${summary} (${written.total} note(s) now)` };
    }
    if (summary !== undefined || body !== undefined) {
      return {
        kind: "text",
        text: "writing a note needs both a summary and the note itself.",
      };
    }

    const notes = readNotes(request.root);
    const about = request.args.get("about");
    const wanted = about === undefined ? notes : matching(notes, about);
    if (wanted.length === 0) {
      return { kind: "text", text: "this project has not written anything down yet." };
    }
    return { kind: "text", text: listed(wanted) };
  }
}
