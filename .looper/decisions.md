# Decisions taken with a known cost

Where this project and its own law disagree, on purpose. Append-only.

Most entries are security or legal questions nobody on the team can answer, which
is why they are written down rather than argued. The entry exists so that whoever
can answer one is handed a framed, dated question pointed at the code.

Each entry names the files it rests on and the hash of those files when somebody
last read it, so this document is never trusted to be current: looper recomputes
them and says which entries the code has moved out from under. It never edits the
prose, because what an entry says is a judgement and no tool refreshes a judgement.

## 2026-08-20 — Doctrine branches are droppable, reversing the rule that they must always arrive

kind: law
depends: src/router.ts, src/allocator.ts
checked: 2026-08-20  625f7dc87e43

tests/rules-that-never-arrived.test.ts states the opposite, and states it with
evidence: adopter PR #124 counted doctrine:frontend going over the side 32 times
in one session while interface work was being done, and a rule that never arrived
is indistinguishable from a rule that was followed. Branches were made required
for that reason. This entry is the departure from it, in the open.

Two measurements taken on 2026-08-20 changed the balance.

Required did not mean arrived. With branches required the allocator could not
drop one, so the injection simply grew: nine branches went out at 19,354
characters against a stated ceiling of 9,800, and the only things reported as
dropped were looper's own status lines. Nobody was told.

Overflow is not a trimmed tail. Measured against Claude Code 2.1.236 with a
temporary hook emitting a sentinel at each end, 10,000 characters arrive whole
and 10,001 are replaced by a 2,000-character preview and a file path. So one
character past the ceiling nothing arrives, including the constitution.
Required was therefore not protecting doctrine; it was risking the whole prompt
to protect one branch.

The cost accepted: a branch that does not fit is not in the prompt. What makes
that survivable rather than the failure #124 named is that the drop marker is now
an index. Every dropped contribution is listed with its size and its own first
line ("Making a query fast before it is slow."), and the doctrine tool fetches it
by name. A rule that is offered and not taken is a different thing from a rule
that vanished.

What has to be true for this to come out: push an index and pull the bodies, so
that nothing has to be dropped at all. Until then this trade stands.
