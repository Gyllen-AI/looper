# What this project is built from

Measured by looper from what is on disk, not chosen. It is the record of a
decision, so adding a language here is how you make that decision on purpose
rather than by accident at four in the afternoon.

`STACK:1` refuses a source file in a language this document does not list. The
way through is to add the row, in the same commit, where a reviewer sees it.

Counted from the files looper judges. Anything outside the law is not here — a
vendored dependency, a folder named in `law.toml`, or a directory that governs
itself — so this is what the rule can see rather than every file on disk.

## Backend

| language | how looper knows |
|---|---|
| TypeScript | package.json, and 140 file(s) |
| JavaScript | package.json, and 1 file(s) — `bin/looper.js`, the shim that starts looper before its TypeScript can be read |
| Python | 1 file(s) on disk |

## Frontend

_Nothing found. looper writes what it measures, so an empty half means an empty half._

First written 2026-08-18. looper never rewrites it: once this file exists it is
yours, and looper only reads it.
