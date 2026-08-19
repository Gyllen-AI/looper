# The seer

Two programs that let an agent look at a window on your screen, and cannot look
at anything you have not ticked.

**Neither of them is installed, and neither arrives with looper.** The package
does not ship this directory at all, and a test refuses looper's own suite if it
ever does. What is here is source you install by hand, on your own machine,
because it is your screen.

## What each half does

**`windows/consent.ps1` — yours.** A small always-on-top window listing the
windows currently open. Tick one and the agent may look at it; untick it and the
agent may not. Close the window and the agent can see nothing at all. Nothing
outside this window can tick a box: not looper, not the agent, and not whoever is
writing the agent's prompts.

**`windows/capture.ps1` — asks yours before every capture.** It connects to the
consent window over a local pipe, sends the title it was asked for, and stops
with exit code 5 if the answer is anything but yes, or 6 if the consent window is
not running at all. Those are two different facts and an agent that cannot tell
them apart will tell somebody to tick a box they have already ticked. It also
answers `armed?`, which returns what is ticked and every window title open, so
the agent can read the state instead of guessing at it. Only then does it capture,
and it says beside the picture whether the window was actually rendering:
`rendering`, `minimised`, or `blank` when the window drew nothing because it
paints on the graphics card. looper repeats that to the agent, because a picture
of a minimised window is honest and useless, and an agent will reason from it.

There is no third program and no Linux one. The seer looks at Windows windows,
so it is installed under `windows/` whether looper itself is running on Windows
or inside WSL beside it; looper reaches PowerShell directly in both cases. A
shell shim used to sit under `linux/` and translated exit codes on the way back,
which is exactly where "the consent window is not running" became
indistinguishable from "that window is not ticked". It is gone.

## Installing it, on the machine whose screen it is

```sh
mkdir -p vendor/seer/windows
cp seer/windows/capture.ps1 vendor/seer/windows/
```

looper looks for `vendor/seer/windows/capture.ps1` and offers its `see` tool only
when that file exists and it is running on Windows or under WSL. Delete it and
the tool disappears again.

Then start the consent window, and leave it where you can see it:

```sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File seer/windows/consent.ps1
```

Nothing can be looked at until you tick something in it.

## What is not covered

Only WSL-with-Windows is built. A Linux desktop and macOS each need their own
pair, and until a platform has both halves it has no seer — a capture program
without a consent window is the thing this design exists to refuse.
