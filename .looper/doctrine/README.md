# Your project's doctrine

looper injects `constitution.md` from this folder on every prompt, after the
rules it ships with. Branch files beside it load only when you touch the area
they govern, per `map.toml`.

**This README is never injected. Every other file here is, exactly as written,**
so nothing in them is free and there are no comments to hide notes in. Notes
belong here.

## constitution.md

The constitution is the rules that hold **no matter what you are working on**.
That is what the name means here, and it is why it is not named after a subject
the way the other files are: everything else in this folder loads only when you
touch the area it covers, and this one is read on every single message.

It starts empty on purpose, and empty costs nothing. looper already carries the
rules that are true for any project, so this file is only for what is true for
*yours*.

A line earns its place if the model would not already do it. Good lines sound
like:

    Money amounts are integers of the smallest unit. Never a float.
    Ask before changing anything a customer can see.

Lines that restate what it already does make it hedge more, not less:

    Write clean code.
    Be thorough.

Keep it short. Ten lines is a lot.

## Branch files

When a rule only matters while doing one kind of work, put it in a branch
instead, and map that branch to the files it governs. Name the file after the
branch: `frontend.md` for the `frontend` entry in `map.toml`.

A rule anchored to something that actually went wrong, with the date, is
followed. The same rule as a general principle is skimmed.
