#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";

const OURS = ["stripTypeScriptTypes", "registerHooks", "Type Stripping"];

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (OURS.some((named) => warning.message.includes(named))) return;
  console.error(`${warning.name}: ${warning.message}`);
});

registerHooks({
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), {
        mode: "strip",
        sourceUrl: url,
      }),
    };
  },
});

await import("../src/main.ts");
