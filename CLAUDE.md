# Neon Strip

A third-person 3D casino crawl: walk a neon Vegas strip, enter casinos, play
blackjack and craps against a persistent bankroll. React Three Fiber → Vercel.
dev deep links in [docs/dev-links.md](docs/dev-links.md).


## Architecture

- **Game rules are pure TypeScript with zero rendering imports.** Engines live
  in `src/games/`, take a seed, and are tested. Scenes read engine state; they
  never contain rules. This is the decision the project rests on.
- **`src/character/` is pure the same way** — measurements, appearance model,
  wardrobe and every attachment point are tested; `CasinoCharacter` decides
  nothing and only draws.
- **Never make an engine time-dependent to serve an animation.** Presentation
  clocks live in the store (`src/scenes/revealTimeline.ts`); the engine decides
  the roll and physics only performs it.
- **Layout constants live in layout modules, never in components**:
  `tableLayout.ts`, `shopLayout.ts`, `stripLayout.ts`, `clinicLayout.ts`,
  `casinoFloorLayout.ts`, `character/proportions.ts`. Derive related numbers
  from each other — the strip's walk limit from a kerb, `BLOCK_DEPTH` shared by
  towers, doors and road markings — so a disagreement becomes impossible rather
  than merely untested. Where a fixed camera and a piece of geometry have to
  agree, both belong in the same module so a test can hold them to it.

## Testing

Vitest, `node` environment, tests in `src/__tests__/`. Everything tested is
pure — there are no rendering tests, by design. Every non-trivial test carries a
comment naming the user-facing behaviour it protects.

**Test what a screenshot cannot show.** The categories that have caught real
bugs here:

- **Hand-placed 3D coordinates**, against a containment predicate: `isOnFelt`,
  `isOnBody`, `isOnShopFloor`, `isOnClinicFloor`, `isOnStrip`, `partsOverFace`.
  Each is paired with a test feeding it a point it must *reject* — a predicate
  that returns true everywhere leaves its whole suite passing while proving
  nothing.
- **Geometry itself, not just where it attaches.** An anchor is not a shape.
  `floatingParts` refuses a piece attached to nothing; `fightingSurfaces`
  refuses two parallel flat faces closer than a millimetre. Only flat
  axis-aligned faces count (curved surfaces share a bounding-box plane and
  nothing else); coincident is a conflict, back-to-back is flush and fine; the
  threshold is arithmetic — the depth buffer resolves ~0.01mm at four metres.
- **Worn geometry against the body it covers** (`itemParts.test.ts`). Item and
  body lists each pass alone while a bodice sits at exactly the chest's radius.
- **A predicate whose window is a box will condemn correct art.** Sample the
  feature itself, skipping samples where it is behind the surface;
  `containsPoint` in `parts.ts` gives a solid test per shape rather than a
  bounding box.
- **Money invariants** — every offered stake must pay whole dollars on every
  outcome. Property tests caught both a $62.50 natural and 6:5 held as `1.2`.
- **Ordering and timing** — `revealTimeline.ts` is pure precisely so "the result
  is announced before the card that caused it" is assertable.
- **What a fixed camera can see**: the **angle a thing subtends across the
  view** (`mirrorSubtendedAngle`), plus **headroom** for anything tall
  (`waterfallHeadroom`, which needs `PLAY_FOV` from `src/world/camera.ts`).
  Width alone passes on a six-metre cascade drawn five metres off the top of
  the frame.

Not everything geometric is reachable this way — armless silhouettes from a
`shoulderX` inside `torsoWidth / 2` were found in a capture and only then
pinned with a test.

## Money

- **Whole dollars throughout**, including the marker: `splitWinnings` in
  `src/world/money.ts` is integer-only and the odd dollar goes to the player.
- **Ratios (3:2, 6:5, 2:1) are numerator/denominator** applied with integer
  arithmetic. Never decimals.
- **Payout values are chips returned including the stake**, so a caller debits
  on wager and credits on settlement and the two net out.

## Interaction

- **Nothing happens to the player because they walked somewhere.** Proximity
  offers, F accepts — one key for everything, because only one offer is ever in
  range and the prompt says which. `useActionKey` is the only listener and
  guards `event.repeat`.
- **Two targets offering *different* things must not overlap** — the handler
  takes the nearest and does not rank. `venueDoors.test.ts` holds it for every
  door, seat and the shop's mirror.
- **Two targets offering the *same* thing should overlap**, because circular
  prompts along a row cannot be both non-overlapping and gapless, and gapless is
  what matters. A prompt is also only as good as the width of floor it covers.
- **Anything long gets a `halfLength`**, making its prompt a capsule. A circle
  wide enough to reach a five-metre craps rail reaches across the room and steals
  the blackjack stools' prompts.
- **A seat you cannot choose is not a seat.** One prompt per stool; stools
  someone else holds are not offered at all.

## Commands

```
npm run dev         # vite, port 5180 by convention
npm test            # vitest
npm run typecheck   # tsc --noEmit, strict + exactOptionalPropertyTypes
npm run build
npm run shot <url> <out.png> [settleMs] [keys]
npm run shots [outDir]          # every scene; SHOTS_BASE_URL picks the server
npm run locate <url> [prefix]   # world positions of named objects
npm run walkthrough [baseUrl]   # plays the app the way a player does
npm run multiplayer [baseUrl]   # two players at once; needs the worker running
npm run shared-blackjack [url]  # two players at one table, one shoe
npm run seat-claims [wss://]    # seat exclusivity and the deal clock, over the wire
npm run worker:dev              # the presence worker, locally
npm run worker:deploy           # the presence worker, to Cloudflare
npm run typecheck:worker
```

### The browser-driven checks take turns

`walkthrough`, `shots` and `multiplayer` all drive headless Chrome on a software
renderer. Two at once do not merely run slowly — they give *wrong answers*,
because the walkthrough asserts by holding a movement key for a fixed number of
bursts, so frame rate is distance travelled.

- `lockf -t 2400 .verify.lock` wraps them in `package.json` (macOS ships no
  `flock`). Waits 40 minutes for its turn, then gives up.
- `scripts/machineLoad.mjs` refuses below a third of the machine idle. Override
  with `IGNORE_MACHINE_LOAD=1`.

  **Idle CPU, not load average** — that was the first version and it refused on
  a machine with five cores free. macOS counts kernel-blocked threads in the
  load average and Chrome, VS Code and the agent keep hundreds, so an ordinary
  desktop reads 12–18 at 54% idle. When something *is* eating the machine, look
  for it before waiting on it: a capture script that throws never reaches
  `browser.close()`, and the orphaned headless Chrome holds a core indefinitely.
  `ps -eo pid,etime,%cpu,command | grep headless` finds them.

Both decline with exit **75**, deliberately not the code a failing check uses.
**Report which one happened.** Queued or load-refused is fine; a red walkthrough
is not. Sitting silent for forty minutes reads as a hang, and reporting a load
refusal as a test failure sends the next hour after a bug that is not there.


## Working style

- Prefer a reference image over a description for anything visual. The Comfy
  renders in `art/refs/` are the most efficient direction given on this project.

## Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Renderer | `three` | 0.185 |
| React bindings | `@react-three/fiber` (needs React 19) | 9.7 |
| Helpers | `@react-three/drei` | 10.7 |
| Physics (craps dice only, from Wed) | `@react-three/rapier` | 2.2 |
| Character controller | hand-rolled, transform-based | — |
| State | `zustand` | 5.0 |
| Build / host | Vite + TypeScript → Vercel | — |

## New Features
1. Make a semantically named git worktree
2. Plan out the feature add using plan mode
3. Implment code
4. Test deterministic / command style first
5. then test visually if relevant against localhost
6. If successful, pull latest main and merge into worktree if updates occurred. Resolve conflicts if necessary.
7. Merge worktree into main, push, and redeploy production

If any of these are unsuccessful fix changes and retry.

**Deploy only from a clean checkout sitting on pushed `origin/main`.** Push
first, then `npx vercel --prod`. Vercel is not linked to git, so nothing
enforces this — and a deploy from a worktree or a dirty tree puts a build live
whose commit is nowhere on GitHub. That has already happened: production ran a
refactor that had never been pushed, while `main` had moved two commits past it
and neither the repo nor the deploy said so.
