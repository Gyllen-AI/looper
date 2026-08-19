Building the part a person looks at. This is the roof over four branches, and
the rules live in them: `ui/state` (what a screen may say), `ui/assets` (the
bytes it ships), `ui/motion` (what moves), `ui/reach` (who can use it). Pull the
one you are in rather than all four.

- **Judge it at the size it will be used, on real data, by looking at it.** A
  layout reasoned about is not a layout seen, and a screen nobody looked at is a
  claim, not a result.
- **The surface is the contract, and it is two directions.** What the screen asks
  for and what it is pushed are different shapes with different failure modes, and
  a screen that polls for something it is already sent pays twice.
