# Child surface design language

This is the spec for keeping `public/child` looking and feeling like **one app**
as new games get added. Games will change — new item types, new strands, new
mini-mechanics — but a kid who's played one of them should never have to
re-learn the interface for the next one. Read this before adding a fifth item
renderer, and update it if you deliberately change any rule below (don't let
it silently go stale).

`ui-designer` owns this file the same way it owns `public/shared/styles.css`.
`kid-ux` is the backstop for anything here that starts to look like it
rewards/compares kids rather than just reacting to them — see Guardrails.

## The one sentence version

**Every game is a different question. None of them are a different app.**
The prompt, the input widget, and the specific illustration can be anything a
concept needs — a number line, a balance scale, a shape to partition. What
must never change from game to game is: who's narrating it (Fizz), how
progress is shown (the path track), what the type/color system is, and how
motion feels (hop / cheer, nothing else).

## The shared shell every screen renders into

```
.wrap                        <- one flex column, owns the full 100dvh
  #app                       <- flex:1, swapped wholesale on every render()
    .screen                  <- flex:1 column; every top-level view uses this
      .topbar (flex:0)       <- who's playing (session views only)
      .stage (flex:1)        <- THE ONLY PLACE A NEW GAME'S MARKUP GOES
      .path-wrap (flex:0)    <- Fizz + the path track (session views only)
  .foot-link (flex:0)        <- "tutor view", always last
```

`showItem()` in `child.js` is the pattern to copy: build your game's markup as
an array of elements returned from a `renderYourGame(item, startedAtMs)`
function, and let the existing wiring put it inside `.stage`, with the
existing topbar/path-track around it. **Do not** render your own topbar,
progress indicator, or outer card — that's exactly the drift this file exists
to prevent.

### Why no scrolling

A K-5 player should never discover a scrollbar mid-question — `html`/`body`
are pinned to `100dvh` and every screen fills it via the flex chain above.
Two views are the deliberate exception: the student roster (`.picker-scroll`)
and the star map (`.const-scroll`) can be genuinely longer than one screen, so
*they* get an internal scroll region rather than clipping content — the page
itself still never scrolls. A new game's `.stage` content should never need
this escape hatch; if it does, that's a signal the game has too many rows
stacked vertically (see "Budgeting stage height" below), not a reason to add
`overflow: auto` to a new element.

### Budgeting stage height

`.stage`'s padding, gaps, and every SVG/shape height in it are `clamp()`s
tuned against the **tallest** item type that exists today (the balance scale:
prompt + subprompt + a shape + a row of choice buttons — four stacked rows).
If your new game also needs four rows, budget it the same way the balance
scale is budgeted (see the comments directly above `.balance-area svg` in
`index.html`) rather than giving it more generous sizing than that ceiling —
otherwise it'll be the one game that scrolls on a normal laptop window. Three
rows or fewer (prompt + one widget, or prompt + subprompt + one widget) has
real headroom; use it, don't feel obligated to stay cramped.

## Fizz

Fizz is the one mascot every game shares — see `FIZZ_SVG`/`fizz()` in
`child.js` and the `.fizz*` rules in `index.html`. It's a species-neutral
"spark critter" on purpose: no ears, fur, or props that would clash with a
specific game's own subject matter (a space level, an underwater level, a
farm level all sit fine next to it).

**Colors are never hand-picked for Fizz.** Body/belly reuse `--play` (this
surface's one accent); the antenna spark reuses `--status-mastered` (the
shared token legend's *one* reward color, already used for the mastery pulse
ring and the star map's bloom tier). If a new game seems to want a new Fizz
color, that's a sign it wants a new *accent*, which is a bigger, separate
design conversation — don't solve it by giving Fizz a one-off hex value.

**Poses are a fixed, small vocabulary — don't add a fourth without updating
this file:**

| Pose | Class | Means | Used at |
|---|---|---|---|
| idle | *(base `.fizz` class — always on)* | alive, resting | every Fizz, continuously |
| hop | `fizz-hop` | one step of progress | the path track, on every advance |
| cheer | `fizz-cheer` | a bigger moment, still not a score | mastery-beat end card |

"Idle" isn't a neutral no-op — it's a continuous, slow (`fizz-idle`, 3s loop)
bob-and-tilt every Fizz plays all the time, so the mascot never looks like a
static icon even between interactions. `hop`/`cheer` layer their finite
animation *on top of* idle (both list `fizz-idle` alongside their own
keyframe in the `animation` shorthand — see `.fizz-hop`/`.fizz-cheer` in
`index.html`) rather than replacing it, so idle resumes seamlessly the
instant a hop or cheer finishes. If you add a fourth pose, keep this same
"idle plus one finite animation" composition — don't let a new pose turn
Fizz motionless while it plays.

There is deliberately no "wrong answer" pose. This engine never tells a
child their answer was incorrect (see `submitAndAdvance`'s fixed "Nice — next
one" — every response advances the same way), so Fizz never has a sad/error
state. If a future game type needs to represent a *stuck* or *escalated*
state, that already has its own honest treatment (`showEmpty`'s pause/
hourglass icons) — don't invent a Fizz mood for it without a kid-ux pass.

Sizes: `fizz--sm` (28px, headers/inline), `fizz--md` (46px, the path track,
end-card icon-wraps), `fizz--lg` (76px, reserved for a future full-screen
celebration — nothing uses it yet).

## The path track — the one progress mechanic

`pathTrack(total, index, { justAdvanced })` in `child.js` is the answer to
"the UI language must stay the same across games": every item type funnels
through this one call after every response. It draws `total` nodes along a
fixed arc (one per item in the assignment), places Fizz on the current node,
and plays the hop animation when `justAdvanced` is true.

Rules for extending it, not replacing it:
- A new game adds items to an assignment the same way existing games do —
  it does not get its own progress widget.
- Node states are exactly two: not-yet-reached (dashed outline, reusing the
  star map's own "seed" convention) and done (`--status-mastered` solid).
  There is no third "wrong" state — see Fizz's poses above for why.
- The chip below the track ("N to go — not a score") is the one place a
  number is allowed on this whole surface, and only because it's paired with
  its own denial that it's a score. Don't add a second number anywhere else
  without the same pairing, and run it past kid-ux regardless.

## Type & color

- `--display` (Baloo 2) is for the handful of big, game-y moments: the
  prompt, screen headings (`h1`/`h2` on picker/star-map/end/empty cards).
  Loaded once in `public/child/index.html`'s own `<style>` the same way
  `public/tutor`'s `--serif` is local to that surface — never add a second
  display font.
- Everything else (subprompts, buttons, chips, body copy) stays on the
  shared `--sans` — the child surface should feel *distinct* from the tutor
  dashboard, not like a second, unrelated type system.
- Every color a new game uses must trace back to a token in
  `public/shared/styles.css`, this page's own `--play`/`--fizz-*` tokens, or
  the `--hue-0`..`--hue-5` decorative palette below. If a game's content
  needs a genuinely new hue (e.g. a new manipulative that doesn't read well
  in the existing palette), that's a `ui-designer` + `kid-ux` conversation,
  not a CSS value to add inline.

### Light-only, deliberately

This surface pins every shared token to its light value unconditionally
(see the block right after `--play` in `index.html`) and never follows
`prefers-color-scheme: dark` — a product decision, not an oversight: a K-5
kid didn't choose their device's dark-mode setting for this app, and a
bright, sunlit palette reads as "a place to play" the way a dark UI doesn't
for this age group. `public/tutor` is untouched and still follows the OS
theme normally — this is child-surface-only. If you add a new token on this
page, give it one light value, not a light/dark pair.

### The decorative hue palette

`--hue-0` through `--hue-5` in `index.html` are exactly the 6 hues
`shared/styles.css`'s avatar system already uses (`.avatar[data-hue="0..5"]`)
— reused, not reinvented, so a new color on this page is always "one the app
already has an identity for." Two rules keep this from turning into visual
noise:

- **`--hue-1` (teal) is off-limits for decoration.** It *is*
  `--status-mastered` — the app's one reward color (mastery pulse ring, star
  map bloom tier, Fizz's spark). Reusing it for a button or a background tint
  would blur that meaning. The other five are free to use.
- **Pick one fixed hue-pair (or hue) per game, applied via a `data-hue`
  attribute on the element** (see `.choice-card[data-hue]`,
  `.balance-choice[data-hue]`, `.picker-play[data-hue]` in `index.html` for
  the pattern) — a stable color convention a kid can learn, not a random
  color per render. Never let a color choice correlate with which answer is
  correct; `renderCompare`'s blue/magenta pair is fixed to `side` (`a`/`b`),
  and which side holds the right answer is randomized independently by the
  item generator.

## Motion

Reuse the shared `--dur-*`/`--ease-*` tokens from `public/shared/styles.css`
for anything that isn't Fizz-specific (a card's hover lift, a fade-up on
mount). Fizz's own `fizz-idle`/`fizz-hop`/`fizz-cheer` keyframes (see the
Fizz section above) and the background's `bg-drift-*` keyframes are the only
surface-specific motion, and all of them already respect
`prefers-reduced-motion: reduce` — carry that same guard on anything new.

**Ambient motion has a hard ceiling: it may never compete with the question
on screen.** The four `.bg-blob` elements (soft, slow-drifting color glows,
`index.html`) are `position: fixed` behind `.wrap` (`z-index: 0` vs. `.wrap`'s
`z-index: 1`) specifically so they only ever show in the margins around the
opaque white `.stage` card, never through it, and each drifts a few pixels
over 24-30 seconds — slow and small enough to read as "the world is alive,"
never as something asking to be watched. If you add a new ambient touch
(another blob, a drifting cloud shape), hold it to the same three
constraints: stays behind `.wrap`, moves slowly, stays out of `.stage`.

## Guardrails (from `SWARM.md` — non-negotiable)

- **No score, leaderboard, or comparison, ever.** The path track's "N to go"
  chip is deliberately paired with "— not a score" for exactly this reason;
  don't add a raw number anywhere without the same treatment, and don't add
  any UI that lets one child's progress be compared to another's.
- **This surface is observation-only.** Fizz reacts to what already
  happened; it never decides what happens next (what to show, whether an
  answer was "right") — that judgment stays server-side in the engine.
- **A new reward color is not a design decision to make solo.** This app
  has exactly one (`--status-mastered`, teal) on purpose — an amber/gold
  celebration ring was proposed once for the mastery pulse and rejected for
  reading too much like a coin/trophy token. If a new game seems to need a
  second reward color, that instinct is usually solvable by reusing the
  existing one instead.

## Checklist for a new game/item type

1. Write `renderYourGame(item, startedAtMs)` returning an array of elements
   (prompt, optional subprompt, your widget) — model it on
   `renderCompare`/`renderPartition` in `child.js`, not on a fresh design.
2. Wire it into `showItem()`'s branch on `game_id`/`item.kind` — don't touch
   the surrounding `.screen`/topbar/`pathTrack()` call, they're already
   shared.
3. Size your widget with `clamp()`s budgeted against the four-row balance-
   scale ceiling described above, using `vh` for the flexible term the same
   way every existing widget does.
4. Every tap target stays comfortably above kid-ux's existing
   ~52×66px minimum (the balance-choice buttons are the reference).
5. Confirm in the browser at a normal window, a phone width (~400px), and a
   short window (~480px tall or less) that nothing scrolls except the two
   named exceptions above — the short-viewport `@media (max-height: 480px)`
   block in `index.html` is where you tighten things further if needed.
6. Run `npm test`; if you touched shared markup/classes, check the other
   item types still render correctly, not just your new one.

## Open ideas, not yet built

- **Fizz's antenna brightening with real mastery.** The spark color already
  reuses `--status-mastered`; making its *intensity* reflect the student's
  actual belief-model mastery (not just a fixed color) would tie the mascot
  directly to the engine's own signal instead of being purely decorative.
  Needs a belief fetch on the session screen that doesn't exist yet — don't
  fake it with a client-side counter in the meantime.
- **`fizz--lg` / a dedicated full-screen celebration.** Reserved but unused;
  don't reach for it until there's an actual moment that warrants going
  bigger than the current end-card treatment.
