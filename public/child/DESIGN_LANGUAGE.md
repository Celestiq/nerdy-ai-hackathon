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
      .topbar (flex:0)       <- who's playing + Home (session views only)
      .stage (flex:1)        <- THE ONLY PLACE A NEW GAME'S MARKUP GOES
      .path-wrap (flex:0)    <- Fizz + the path track (session views only)
```

**There is no link to the tutor view on any child screen**, picker included
(user decision 2026-09-15: one tap reached classmates' names and stuck flags).
Tutors open `/tutor/` directly. Don't add one back.

### Leaving and finishing a session

- Every in-session screen (item and between-item feedback) uses
  `sessionTopbar()`: the player on the left, a `Home` pill (`.session-home`,
  ≥44px tall) on the right. `quitSession()` goes straight back to the Star
  Path if nothing has been answered; with at least one answer it calls
  `finishSession(false)` (or `finishSession(true)` if every item was already
  answered), which posts an abandoned bundle (`completed:false`,
  `abandoned_at` set) so those answers still count, then returns to the map
  (no end card). A Home tap while an answer is still being sent waits for it.
- `finishSession()` builds the bundle once and `postBundle()` shows the shared
  spinner ("Saving your answers...") while it posts. A failed post shows a
  friendly retry card ("Oops, that didn't send" / "Try again"), never a
  frozen screen; after a second failure it also offers "Back to my stars".
  `api()` throws on any non-2xx response, so errors never render as data.
- Any delayed callback that can re-render (feedback timeout, balance-scale
  settle) must check `state.phase === "playing"` first.

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
and the Star Path's trails (`.const-scroll`) can be genuinely longer than one screen, so
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
| hop | `fizz-hop` | one step of progress, or "I noticed that" | the path track, on every advance; the Star Path narrator, when a star is tapped (it hops *behind* its own speech bubble, which sits at `z-index: 2`) |
| cheer | `fizz-cheer` | a bigger moment, still never a result | mastery-beat end card |

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
child their answer was incorrect (every response advances the same way, with
one line picked at random from `ACK_LINES` in `child.js`, never the same one
twice in a row), so Fizz never has a sad/error state. Every line in
`ACK_LINES` must make sense after *any* answer (including the last item, so
no "next one"), and the choice must never
depend on correctness, a streak, or a count. If a future game type needs to represent a *stuck* or *escalated*
state, that already has its own honest treatment (`showEmpty`'s pause/
hourglass icons) — don't invent a Fizz mood for it without a kid-ux pass.

Sizes: `fizz--sm` (28px, headers/inline), `fizz--md` (46px, the path track,
end-card icon-wraps), `fizz--lg` (76px base; the "Fizz is talking to you"
size). `fizz--lg` is used wherever Fizz is the narrator of a whole screen —
the picker greeting and the Star Path — and those two screens scale it with
a `clamp()` on their own container (`.picker-head .fizz--lg`,
`.map-fizz .fizz--lg`: up to ~128px / ~200px on tall windows, down to
40-60px on phones and short windows) rather than adding a fourth size class.
One Fizz per screen, always.

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
- **Nothing is written under the track.** The nodes and Fizz's position are
  the whole progress signal. The old "N to go" chip (with its score disclaimer) was
  removed: it put a digit on every question screen, and the disclaimer
  mostly taught a child that scores exist. No counts, digits, or disclaimers
  in session chrome or on end/empty cards. Numbers that are part of the
  *question itself* (number-line end labels, fraction labels) are content,
  not chrome, and are fine.

## The picker — "Who's playing?"

`showPicker()` is the first screen. Fizz (`lg`) greets the child with the
shared `.speech-bubble` (the `h1` "Who's playing?" plus a one-line note),
above a grid of big avatar cards (`.picker-play`, one `<button>` per
player). The head and grid are centred **as one group** in the screen, so a
small roster never leaves most of the screen empty.

- Cards are vertical (big avatar with a white ring, name in `--display`
  below): 3 columns on desktop, 2 at ≤640px wide, and horizontal
  (avatar beside name) at ≤480px tall.
- Each card is washed in **that player's own avatar hue** via `data-hue`
  → `--card-hue` (a top-to-bottom tint plus a matching border). This is the
  one place `--hue-1` teal appears as decoration, because it *is* that
  player's avatar identity color from `shared/styles.css`, not a reward cue.
- Cards fade up in a short capped stagger (one-shot), lift on hover, and the
  avatar tilts slightly. No motion under `prefers-reduced-motion`.
- `.picker-scroll` is the roster's only scroll region and only takes the
  height it needs.

## The Star Path — the child's home

`showConstellation(student, hue)` in `child.js` is the screen a child lands on
after picking their name, and the screen every session returns to ("See my
stars" on the end card, "Back to my stars" on the empty card, the in-session
`Home` button). Play starts
only from here. Layout inside one `.screen--map`: a `.topbar`, then
`.map-layout`, a CSS grid with three areas:

```
wide (>=760px)                              narrow (<760px)
+-------------+--------------------+        .map-head      Fizz + bubble (row)
| .map-head   | .const-scroll      |        .const-scroll  the trails
|  bubble     |  one .trail per    |        .map-play-row  Play
|  Fizz (lg)  |  authored strand   |
+-------------+  (the only         |
| Play        |   internal scroll) |
+-------------+--------------------+
```

On wide screens the narrator column (bubble above a big Fizz, Play below)
gives Fizz real presence and hands the rest of the width to the map. The
bubble is top-aligned with the map card (centring it left a tall empty band
above it). The step length between stars is sized off the map card's width
(`container-type: inline-size` on `.const-scroll`, `cqi` in `--step`, with
the longest trail's star/step counts passed in as `--stars`/`--steps`), so
the longest trail fills the card instead of leaving its right third empty. The
bubble has a `min-height` sized for its longest content so swapping its text
on a tap never makes Fizz jump. The trails sit on one opaque white "map"
card (`.const-scroll`, with a faint sand dot grid) — the same role `.stage`
plays for a question, so the background blobs never show behind a star.
At ≤480px tall and ≥760px wide each strand's signpost moves beside its
trail instead of above it.

Rules:
- **All judgement comes from `GET /api/child/map/:studentId`.** It returns
  authored concepts only, a `tier` per concept (`seed | glow | bloom |
  fading`), the prerequisite edges, per-strand `hasComingLater`, and at most
  one `next: true`. The client never fetches `/api/belief` (that carries
  probabilities) and never works out a tier or "what's next" itself.
- **Trails, not grids.** Each strand is one short, *winding* row of stars
  in prerequisite order (server-sorted) under a small sand signpost
  (`.const-strand-title`). Stars alternate a little above/below the row's
  midline (`.trail-slot--up/--down`, via `top`, never `transform`, so hover
  and pop-in still work) and each neighbouring pair is joined by a
  `.trail-step`: a tiny SVG S-curve drawn as a soft sand "road" with a
  dotted footstep line on top. Geometry is derived from `--star` (`--wave`
  = the offset, a step is exactly `2 * --wave` tall), so it holds at every
  width. The trail is **one neutral sand material for every strand** on
  purpose: blue, purple and teal already mean glow/fading/bloom here, so
  strand-coloured trails would muddy the tiers. Stub concepts are never
  drawn as stars. A strand with stubs ends in a fading step
  (`.trail-step--fade`) into three soft `.trail-more` dots; strands with no
  authored content collapse into one `.trail-coming` sentence, "More star
  trails coming soon!", with no list of strand names (a 1st grader can't
  read "Patterns & algebra", and it's a list of things they can't do).
- **Tiers — size, fill and ring all change, so they never read as one shape
  in three tints** (`--k` scales the star; every tier stays ≥42px):
  - *seed* (`--k` 0.84): hollow dashed grey outline on a sunk fill, faint
    outline star. Clearly "not yet".
  - *glow* (1.0): solid `--status-emerging` ring, star half filled.
    EMERGING and STUCK share it — STUCK never looks alarming.
  - *bloom* (1.14): **solid** `--status-mastered` disc, bright white filled
    star, pale teal halo ring and two teal `.star-sparkle`s that twinkle
    once after the map loads, then rest. Unmistakably earned; still the one
    reward color, nothing gold.
  - *fading* (1.0): the same filled-star-with-a-sparkle shape as bloom,
    softened into lavender (`--status-decayed` mixed toward white, one
    sparkle). It reads as "a star gone quiet", not broken or empty. **It
    is static.** A seeded student has 5-8 of these, and pulsing them all
    at once was too busy, so the old `star-remember` breathe was removed.
    Its copy is framed as care: "This one would love to see you again."
- **The `next` star is the map's focal point and its only continuously
  animated element** (`.const-star--next`, `--k` 1.34): the largest star,
  a thick `--play` coral ring on a warm fill with a filled coral star, a
  soft halo that breathes (`::after`) and a ring that ripples outward
  (`::before`). Never teal. It **overrides the underlying tier's look**. A
  fading star can be `next` (the server allows it), and its sparkle is
  hidden so the two treatments never fight. Fizz's bubble still names the
  real tier when tapped. The server may send **no** `next` star (e.g. every
  candidate is escalated), and then the map simply has no coral star. Copy
  about it must **not** say or imply that Play goes there: the engine picks
  the actual session, and it usually differs (a kid-ux spot check on the
  seeded roster found the session's concepts missed the `next` star for four
  of six students). The star shares the Play button's coral, so the copy
  does the de-coupling: the opening bubble never points at it ("Tap a star.
  I'll tell you its name!"), and its tapped note is Fizz's hedged opinion
  about *soon*: "I think this one is ready to grow soon!" (for a fading
  `next`, the fading note is used instead). If `next` is ever made to match
  the session the engine will serve, this copy can get bolder.
- **Motion budget on the map:** the pop-in cascade (one-shot), bloom
  sparkles (one-shot), Fizz idle/hop, and the `next` halo + ripple (the only
  loop). Under `prefers-reduced-motion` all of it stops: the `next` halo
  stays visible and static, and the ripple is hidden.
- **Names are kid-voice only**, from `CHILD_LABEL` in `child.js`: short,
  concrete, **no digits, no fraction glyphs, no "1/n"**. The graph's own
  labels are tutor-facing and never reach this screen. A new authored
  concept needs a `CHILD_LABEL` entry in the same change (the fallback is a
  generic "A brand-new star").
- **Zero digits in the rendered map** — text and aria-labels alike.
- Stars are real `<button>`s (≥42px, 44-60px normally) with an aria-label of
  "name, tier word". Tapping one marks it `--selected`, makes Fizz hop, and
  swaps the bubble text.

### The speech bubble

`.speech-bubble` is Fizz talking: a white rounded panel with a soft shadow
and a tail pointing at the Fizz beside it, holding an optional `.speech-name`
line (display face; the picker uses its `h1` here) and a `.speech-note` line
(soft sans). By default the tail points left (Fizz to the bubble's left: the
picker and the narrow Star Path). The wide Star Path stacks the bubble above
Fizz and flips the tail to point down. On the Star Path it is
`aria-live="polite"`. The picker and the Star Path both use it. If another
screen wants Fizz to talk, reuse this element rather than inventing a second
bubble, and keep it next to the one Fizz on that screen (never two Fizzes on
one screen).

## Item widgets

- **Number line** (`renderNumberline`): place, adjust, then lock in. A tap or
  press-and-drag on the line moves the marker as often as the child likes;
  nothing is sent until the `Lock it in` button (`.line-lock`, disabled until
  a spot is placed). Don't go back to submit-on-first-tap: it punished a
  slipped finger as a misconception.
- **Fraction bars** (`renderCompare`): each bar is one whole of the same
  length, drawn as `denominator` equal `.bar-cell`s with `numerator` shaded,
  not a single fill width. It uses only the item's `numerator`/`denominator`.
- **Partition** (`renderPartition`): the prompt word comes from the
  `PARTITION_WORDS` lookup (halves … sixths, mirroring `server/routes.ts`).
  An unknown part count says "equal parts", never a digit.
- **End card**: "Thanks for playing!", any mastery beats, "See my stars". A
  mastery beat names the concept with `CHILD_LABEL[concept_id]` only, never
  the server's `label` (tutor-facing, can contain "1/n").
- **Empty card** copy is written for a 6-8 year old reader: short sentences,
  three different messages (done for now / a teacher is helping / new things
  are coming).

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

- **Never a score, leaderboard, or comparison.** No digits or counts in
  session chrome, end cards, or empty cards (see "The path track"), no score
  disclaimers, and no UI that lets one child's progress be compared to
  another's (which is also why there is no tutor-view link here).
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
- **A dedicated full-screen celebration.** `fizz--lg` is now used by the
  picker and Star Path narrators; a celebration card (BACKLOG #3) should
  reuse that size in the `cheer` pose rather than adding a bigger one.
- **A "walked" trail.** Drawing a strand's road solid up to its last
  non-seed star (dashed beyond) would make trails feel more like a journey,
  but it adds a new progress meaning per strand. Needs a kid-ux pass before
  anyone builds it.
