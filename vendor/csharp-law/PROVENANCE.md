# Where this came from

This directory is looper's C# law: the part that reads `.cs` and `.razor` files
and judges them. looper's own code is TypeScript, so this half is C#, because
reading C# properly means using Roslyn, and Roslyn is a C# library.

**It was written here**, unlike `vendor/rust-law` beside it, which is a copy of
somebody else's engine. There is no upstream to re-apply changes from. It sits
under `vendor/` for the same reason the Rust one does: it is built rather than
run from source, and the law does not judge its own engines.

**What it depends on.** Three NuGet packages, and nothing else:
`Microsoft.CodeAnalysis.CSharp`, `Microsoft.CodeAnalysis.Common` and
`Microsoft.CodeAnalysis.Analyzers`. They are vendored beside it as `.nupkg`
files under `vendor/`, and `NuGet.config` clears every remote source so the
build can only use them. That is the same arrangement `vendor/rust-law` has with
`.cargo/config.toml`, and it was checked the same way: restoring into an empty
package folder with no remote source succeeds.

The one external requirement is that `dotnet` exists. A repository with no `.cs`
or `.razor` files never looks for it, and when it is missing the gate says so by
name and passes rather than reporting every C# file as clean.

**Refreshing the packages.** Bump the version in `looper-csharp.csproj`, run
`dotnet restore` with the normal sources, copy the new `.nupkg` files out of
`~/.nuget/packages` into `vendor/`, delete the old ones, then prove the offline
path still works:

```sh
dotnet restore --packages /tmp/looper-csharp-check --no-http-cache
```

That command has no remote source available to it, so if it succeeds the
vendored copies are complete.

**What it does not include.** `--shape`, which the Rust engine answers and
looper's `report` flow uses. It returns an error naming itself as unbuilt. It
comes out when the rules here are accepted and the shapes `report` actually asks
for are known, because building it now would be guessing at a caller.
