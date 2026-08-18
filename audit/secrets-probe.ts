import { findingsIn } from "../src/secrets/detect.ts";

type Probe = {
  readonly name: string;
  readonly text: string;
  readonly expect: "caught" | "quiet";
};

// The vendor-shaped values are assembled at run time rather than written whole, the
// way tests/secrets.test.ts does it. A file of realistic keys is indistinguishable from
// a file of real ones to a scanner, and GitHub's push protection refused this very
// commit until they were split.
const NOTHING_ALLOWED = new Set<string>();

const PROBES: readonly Probe[] = [
  { name: "AWS access key id", expect: "caught", text: `const id = "${"AKIA".concat("3XQZ7RTPLM4WNBVC")}";` },
  { name: "AWS secret access key", expect: "caught", text: `const secret = "${"wJalrXUtnFEMI".concat("/K7MDENG/bPxRfiCYzQ4tHgLp2V")}";` },
  { name: "GitHub personal token", expect: "caught", text: `const token = "${"ghp".concat("_16C7e42F292c6912E7710c838347Ae178B4a")}";` },
  { name: "Google API key", expect: "caught", text: `const key = "${"AIza".concat("SyD-1234567890abcdefghijklmnopqrstu")}";` },
  { name: "Slack bot token", expect: "caught", text: `const slack = "${"xoxb".concat("-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx")}";` },
  { name: "Stripe live key", expect: "caught", text: `const stripe = "${"sk".concat("_live_51H8xQeK7bYzAbCdEfGhIjKlMnOpQrStUvWxYz")}";` },
  { name: "OpenAI key", expect: "caught", text: `const openai = "${"sk".concat("-proj-AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCdEfGh")}";` },
  { name: "private key block", expect: "caught", text: `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----` },
  { name: "password in a connection string", expect: "caught", text: `const url = "postgres://admin:hunter2istheworst@db.internal:5432/app";` },
  { name: "password assigned", expect: "caught", text: `const password = "S3cret-Passw0rd-Not-Guessable";` },
  { name: "a Meta long-lived token", expect: "caught", text: `const meta = "${"EAA".concat("aBcDeFgHi1ZBxKZBoZBqZAZCwZDZD8yQZBvZC0ZAmZBhZC9ZBkZBnZBpZC2ZBsZByZBvZCZAZDaBcDeFgHiJkLmNoPqRsTu")}";` },
  { name: "a JSON web token", expect: "caught", text: `const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";` },

  { name: "a git sha", expect: "quiet", text: `const commit = "3a7ff890f1c2d3e4a5b6c7d8e9f0a1b2c3d4e5f6";` },
  { name: "a uuid", expect: "quiet", text: `const id = "7636aea1-01bb-41d7-8f7e-06063ffac28a";` },
  { name: "a hex colour", expect: "quiet", text: `const brand = "#D7355B";` },
  { name: "a subresource integrity hash", expect: "quiet", text: `const sri = "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC";` },
  { name: "ordinary prose", expect: "quiet", text: `const note = "the retry loop stops after three attempts";` },
  { name: "a public setting name", expect: "quiet", text: `const key = process.env.NEXT_PUBLIC_MAP_STYLE;` },
];

let held = 0;
for (const probe of PROBES) {
  const found = findingsIn(probe.text, NOTHING_ALLOWED);
  const caught = found.length > 0;
  const ok = probe.expect === "caught" ? caught : !caught;
  if (ok) held += 1;
  console.log(`${ok ? "ok  " : "MISS"} ${probe.expect.padEnd(7)} ${probe.name}`);
}
console.log(`\n${held}/${PROBES.length} held`);
