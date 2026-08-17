#!/usr/bin/env node
import { readFileSync } from "node:fs";
import nodeModule from "node:module";

const NEEDS = "22.18";

const OURS = ["stripTypeScriptTypes", "registerHooks", "Type Stripping"];

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (OURS.some((named) => warning.message.includes(named))) return;
  console.error(`${warning.name}: ${warning.message}`);
});

if (
  typeof nodeModule.registerHooks !== "function" ||
  typeof nodeModule.stripTypeScriptTypes !== "function"
) {
  console.error(
    [
      `looper cannot run on Node ${process.version}. It needs Node ${NEEDS} or newer,`,
      "which is the version that can read looper's own source.",
      "Nothing was checked and nothing was changed.",
    ].join("\n"),
  );
  process.exit(1);
}

nodeModule.registerHooks({
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: nodeModule.stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), {
        mode: "strip",
        sourceUrl: url,
      }),
    };
  },
});

await import("../src/main.ts");
