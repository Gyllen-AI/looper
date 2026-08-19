import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

import { ourFiles } from "./our-files.ts";

const SOCKET_CAPABLE: readonly string[] = [
  "node:net",
  "node:http",
  "node:https",
  "node:http2",
  "node:tls",
  "node:dgram",
  "node:dns",
];

test("nothing we wrote can open a socket", () => {
  for (const file of ourFiles()) {
    const text = readFileSync(file, "utf8");
    for (const banned of SOCKET_CAPABLE) {
      assert.ok(
        !text.includes(`"${banned}"`),
        `${file} imports ${banned}. looper runs on every edit and every commit and must not be able to reach the network.`,
      );
    }
  }
});

test("nothing we installed can open a socket either", () => {
  const modules = join(ROOT, "node_modules");
  if (!existsSync(modules)) return;
  const hits = grepTree(modules);
  assert.deepEqual(
    hits,
    [],
    `these installed files reach for the network: ${hits.join(", ")}. The invariant is about the resolved tree, not our own files: a dependency that can open a socket makes looper able to phone home whether we call it or not.`,
  );
});

function grepTree(dir: string): readonly string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      hits.push(...grepTree(path));
      continue;
    }
    if (!/\.(js|cjs|mjs)$/.test(entry)) continue;
    const text = readFileSync(path, "utf8");
    for (const banned of SOCKET_CAPABLE) {
      const bare = banned.slice("node:".length);
      if (
        text.includes(`require("${banned}")`) ||
        text.includes(`require('${banned}')`) ||
        text.includes(`require("${bare}")`) ||
        text.includes(`require('${bare}')`) ||
        text.includes(`from "${banned}"`) ||
        text.includes(`from '${banned}'`)
      ) {
        hits.push(`${path} (${banned})`);
      }
    }
  }
  return hits;
}

const CONNECTING: readonly string[] = [
  "TcpStream",
  "TcpListener",
  "UdpSocket",
  "socket2",
  "libc::socket",
];

const RUST_TREE = join(ROOT, "vendor", "rust-law");

const CRATES_ALLOWED: readonly string[] = [
  "equivalent",
  "hashbrown",
  "indexmap",
  "looper-rust-law",
  "memchr",
  "proc-macro2",
  "quote",
  "serde",
  "serde_core",
  "serde_derive",
  "serde_spanned",
  "syn",
  "toml",
  "toml_datetime",
  "toml_edit",
  "toml_write",
  "unicode-ident",
  "winnow",
];

function rustFiles(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "target") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...rustFiles(path));
      continue;
    }
    if (entry.endsWith(".rs")) found.push(path);
  }
  return found;
}

test("nothing in the Rust half can open a socket either", () => {
  const hits: string[] = [];
  for (const file of rustFiles(RUST_TREE)) {
    const text = readFileSync(file, "utf8");
    for (const banned of CONNECTING) {
      if (text.includes(banned)) hits.push(`${file.slice(ROOT.length + 1)} names ${banned}`);
    }
  }
  assert.deepEqual(
    hits,
    [],
    `${hits.length} file(s) in the Rust half reach for the network: ${hits.join(", ")}. The TypeScript invariant covers node_modules and says nothing about this half, so a crate that can connect would arrive unremarked. Address types are not banned here on purpose: serde parses SocketAddr out of text and cannot open anything with it, while TcpStream can.`,
  );
});

test("the Rust half depends on exactly the crates that were argued for", () => {
  const lock = readFileSync(join(RUST_TREE, "Cargo.lock"), "utf8");
  const lines = lock.match(/^name = "(.+)"$/gm);
  if (lines === null) {
    throw new Error(
      "Cargo.lock names no package at all, so this test would pass on an empty or truncated lock file and prove nothing",
    );
  }
  const named = [...new Set(lines.map((one) => one.slice(8, -1)))];
  const strangers = named.filter((one) => !CRATES_ALLOWED.includes(one)).sort();
  assert.deepEqual(
    strangers,
    [],
    `${strangers.join(", ")} arrived in the Rust half without being argued for in docs/PLAN.md. A dependency that can open a socket makes looper able to phone home whether we call it or not, and Cargo.lock is where one would appear first.`,
  );
});

test("every crate the Rust half needs is in the repository, so no build reaches out", () => {
  const vendored = join(RUST_TREE, "vendor");
  assert.ok(
    existsSync(vendored),
    "vendor/rust-law/vendor is gone, so cargo has to find the crates in whatever ~/.cargo/registry the machine happens to have. --offline then means the build fails on a cold machine rather than reaching out, but the invariant is that the tree carries what it needs.",
  );
  const missing = CRATES_ALLOWED.filter(
    (one) => one !== "looper-rust-law" && !existsSync(join(vendored, one)),
  );
  assert.deepEqual(missing, [], `these crates are locked but not vendored: ${missing.join(", ")}`);
  const config = readFileSync(join(RUST_TREE, ".cargo", "config.toml"), "utf8");
  assert.ok(
    config.includes('replace-with = "vendored-sources"'),
    "the vendored sources are here but cargo is not told to use them, so it would look in the registry instead",
  );
});

const CSHARP_CONNECTING: readonly string[] = [
  "Socket",
  "TcpClient",
  "TcpListener",
  "UdpClient",
  "HttpClient",
  "WebRequest",
  "WebClient",
  "NetworkStream",
  "System.Net.Dns",
];

const CSHARP_TREE = join(ROOT, "vendor", "csharp-law");

const PACKAGES_ALLOWED: readonly string[] = [
  "microsoft.codeanalysis.analyzers.3.11.0.nupkg",
  "microsoft.codeanalysis.common.4.14.0.nupkg",
  "microsoft.codeanalysis.csharp.4.14.0.nupkg",
];

test("nothing in the C# half can open a socket either", () => {
  const hits: string[] = [];
  for (const entry of readdirSync(join(CSHARP_TREE, "src"))) {
    const text = readFileSync(join(CSHARP_TREE, "src", entry), "utf8");
    for (const banned of CSHARP_CONNECTING) {
      if (text.includes(banned)) hits.push(`src/${entry} names ${banned}`);
    }
  }
  assert.deepEqual(
    hits,
    [],
    `${hits.join(", ")}. Address and encoding types are not banned here on purpose, the way serde's SocketAddr is allowed on the Rust side: the three vendored packages reference System.Net.WebUtility, which encodes HTML and URLs and cannot connect to anything.`,
  );
});

test("the C# half depends on exactly the packages that were argued for", () => {
  const vendored = readdirSync(join(CSHARP_TREE, "vendor")).sort();
  assert.deepEqual(
    vendored,
    [...PACKAGES_ALLOWED].sort(),
    "a package arrived in or left the C# half without being argued for in docs/PLAN.md. NuGet resolves a whole graph from one PackageReference, so this directory is where a new dependency appears first.",
  );
});

test("the C# half takes its packages from here and from nowhere on the network", () => {
  const config = readFileSync(join(CSHARP_TREE, "NuGet.config"), "utf8");
  assert.ok(
    config.includes("<clear />"),
    "NuGet.config no longer clears the package sources, so a restore falls back to nuget.org",
  );
  assert.ok(
    config.includes('value="vendor"'),
    "the vendored packages are here but NuGet is not told to use them",
  );
});
