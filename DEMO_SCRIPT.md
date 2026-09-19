# Demo video — the teacher cut (`DemoTeacher`)

Owner: `demo-packager`. Written **2026-09-18** against HEAD `65b171d` and a live server on
:5173. Every string, number and screen asserted below was read off the running app today — see
§10 for the log.

**Runtime: 58 seconds.** Hard cap 3:00. The cut comes in under a minute on purpose: twelve
beats average 4.8 seconds each, so nothing sits still long enough to lose a viewer who is
watching a queue of these.

## Three cuts, one repo

| Composition | Runtime | Aimed at | Script |
|---|---|---|---|
| **`DemoTeacher`** | 58s | **The teacher.** What she gets, what it costs her, what she does with it. | **This file.** |
| `DemoBuild` | 90s | Judges and engineers. What the product is, then how each part works. Light mode. | `archive/DEMO_SCRIPT_BUILD.md` (gitignored) |
| `Demo` | 55s | The original short architecture cut, superseded. | `archive/DEMO_SCRIPT_ENGINEERING.md` (gitignored) |

**`DemoTeacher` is the product submission; `DemoBuild` is the technical one.** All three render
from the same Remotion project and share a palette, motion vocabulary and concept graph; none is
a re-timing of another. `DemoBuild` is light-mode, drops the serif display face entirely, and shows
no captured product screen at all — it is about the machine underneath, and the two jobs dilute
each other if mixed.

Two other locations live beside this file, both gitignored (not part of the submission):

- `video/` — the Remotion project (user decision 2026-09-17): it is tooling for the submission,
  not part of the app, and a reviewer cloning the repo should not trip over a second
  `package.json`. Rendered cuts: `video/out/demo-teacher.mp4`, `video/out/demo-build.mp4` and
  `video/out/demo.mp4`.
- `archive/` — the other two cuts' director's-cut scripts (`DEMO_SCRIPT_BUILD.md`,
  `DEMO_SCRIPT_ENGINEERING.md`) and a rough voiceover-generation draft (`VO_BUILD_DRAFT.md`),
  kept for reference, not tracked.

This file — the director's cut for `DemoTeacher`, the product submission: the spine, the beats,
the copy, and the runbook.

**The screens in the cut are real and already captured.** `video/scripts/capture.mjs` drives
headless Chrome against a freshly seeded local server and writes 2x PNGs into
`video/public/shots/`. Nothing is a mockup. The celebration in beat 11 is a genuine mastery
transition: a real session played through to the screen the server actually produced.

---

## 1. Who this is for, and what it has to do

The audience is **a teacher**, not a judge and not an engineer. She is not asking whether the
architecture is elegant. She is asking three questions, in this order:

1. What does this cost me? *(Five minutes of class. Once, at the start.)*
2. What do I get back that I do not already have? *(A cause, a shared pattern, and forgetting
   I cannot see.)*
3. What do I actually do with it? *(One named opening move for tomorrow morning.)*

So the cut is built around **the morning loop** — play, read, teach, repeat — and that loop is
drawn as a diagram twice: once in beat 4 as a promise, once in beat 12 as a habit. Every other
beat is a link in it.

Engineering is not cut; it is **re-aimed**. The contract guard, the graph walk, the provenance
string, the decision log and the empty grep are all still on screen, but each one is shown as
the reason a teacher can believe the finding above it. The proof serves the claim; it is not
the claim.

## 2. The spine

Everything in the video hangs off **one wrong answer**: a child puts **1/8 to the right of
1/3**, because 8 is bigger than 3.

It opens the video, twice over — two children make it independently. It is the misconception
diagnosed in the middle. It is, verbatim, the provenance string on the graph edge that makes
that diagnosis (`"architecture.html #graph -- worked example: 1/8 placed right of 1/3"`). And
it is the concept named in the opening move the teacher is handed at the end.

**The rule for everything else: if a shot does not advance that thread, it is cut.** No feature
tour, no menu of tabs, no "and you can also…". Twelve beats, one idea each.

**The suspense structure.** The first three beats pose a question and withhold the answer: two
children, one mistake, and an instrument that cannot say why. The answer is then released in
four separate pieces — the game reports (5), the graph converges (6), the pattern is named (7),
the move is written (8) — so a viewer who has the question is given a reason to stay for each
piece. Beats 9 and 10 are the two objections a teacher would raise next, answered before she
can finish raising them: *what about the child it isn't working for* and *what happens when you
change the game*. Only then does the cut show the child, and close the loop it opened.

**What the video has to prove, in order:** (1) the problem is real and it is hers, (2) the cost
is five minutes, (3) the game is not the judge, (4) the diagnosis works and is checkable, (5)
the finding is one she cannot get today, (6) it ends in an instruction, (7) it knows when to
stop, (8) it does not depend on which game, (9) none of it reaches the child.

## 3. Beat sheet

Twelve beats, 58 seconds. No beat runs longer than seven seconds and most run four or five.

| # | Beat | In–out | Runs | The one idea |
|---|---|---|---|---|
| 1 | The same wrong answer | 0:00–0:04 | 4.0s | Two children. One mistake. |
| 2 | What the grade book can say | 0:04–0:07.8 | 3.8s | It marks. It cannot explain. |
| 3 | The pivot | 0:07.8–0:10.5 | 2.7s | Five minutes. |
| 4 | The morning loop | 0:10.5–0:16.5 | 6.0s | Play → read → teach → repeat. |
| 5 | The game reports | 0:16.5–0:22.2 | 5.7s | A game may not send a judgement. |
| 6 | One cause | 0:22.2–0:29 | 6.8s | Both children trace to one idea. |
| 7 | Two facts | 0:29–0:34.5 | 5.5s | A shared pattern, and forgetting. |
| 8 | The opening move | 0:34.5–0:39.5 | 5.0s | A sentence for tomorrow, by name. |
| 9 | It knows when to stop | 0:39.5–0:43 | 3.5s | It hands Devon back to her. |
| 10 | Three games, one judgement | 0:43–0:47 | 4.0s | The engine never sees a game. |
| 11 | What Priya sees | 0:47–0:53.5 | 6.5s | No score. No rank. One star. |
| 12 | The loop closes | 0:53.5–0:58 | 4.5s | Five minutes. One clear move. |

Beats 4, 6 and 11 carry the cut and get the most seconds on purpose — the offer, the reveal,
and the child. Everything else is the scaffolding that makes them land.

**The motion rule.** Everything that arrives springs in and overshoots (`pop()` in
`video/src/theme.ts`); nothing cross-fades. The whole cut lives on one perspective stage, so
screens, cards and worksheets are tilted, spun and pushed like physical slabs rather than
dissolved like slides. Each beat banks the camera in a different direction, so two consecutive
beats never move the same way.

**The type rule.** Every display line arrives **word by word**, each word on its own spring
about two frames behind the last (`Punch` in `video/src/components/text.tsx`). The stagger is
what does the work: it pulls the eye along the sentence in reading order instead of handing
over the whole line at once. Three other treatments exist and are each used for exactly one
job — `Marker` sweeps a highlighter behind the one clause that is an instruction (beat 8),
`Strike` crosses out the one thing a game may not send (beat 5), and `TypeOn` types strings
that are literally repo content (beats 8 and 10).

## 4. Beat by beat

**1 — The same wrong answer · 0:00–0:04.** Maya's worksheet flies in on a raked plane: a number
line, 1/3 in its place, and 1/8 slammed down well to the right of it. Under it, in her own
words: **"Eight is more than three."** At frame 46 Jonah's worksheet lands beside it and the
whole stage recoils — same line, same tile, same sentence. Two red crosses stamp.
**"Two children. The same mistake."** The first frame of the video is a child's work, not a
brand, and the hook is the sameness rather than the error.

**2 — What the grade book can say · 0:04–0:07.8.** Ms. Chen arrives with the only instrument
she has today. The grade book is **a deliberate prop, not a product screen** — it is what a
teacher already owns, and the beat exists to show the exact shape of its limit. Six rows stamp
in, three crosses and three ticks. **"It marks both answers wrong."** Then every mark clears
off the page and a single huge **?** turns into the space they left.
**"It does not say why."**

**3 — The pivot · 0:07.8–0:10.5.** The shortest beat, and the only one with nothing in it but a
person, a number and a promise. A stopwatch ring draws to **5:00** beside Ms. Chen.
**"She changes how class starts." / "Five minutes."** The five minutes are claimed here and
spent in the next beat.

**4 — The morning loop · 0:10.5–0:16.5.** The diagram the video is really selling. The camera
starts pushed into the first card and pulls back as each of the three lands, so the loop is not
visible *as* a loop until the last second of the beat:

```
  1 PLAY  ── 5 minutes ──▶  2 READ ── 1 minute ──▶  3 TEACH ── today
  one short game            one named cause          one opening question
        ▲                                                    │
        └──────────────── EVERY MORNING ─────────────────────┘
```

**"Three steps. One loop."** This is the longest early beat because it is the offer: five
minutes of class, one instruction back.

**5 — The game reports · 0:16.5–0:22.2.** Maya's real number-line screen arrives, then turns
over on its Y axis. On the back is the Observation the game actually sends — five things it may
say, each in plain words with its real field name beside it (`item_id`, `concept_id`, `verdict`,
`signature`, `latency_ms`). A sixth row, **what it means**, is struck out, and beside it, in
mono, the exact message from `ObservationSchema`'s guard in `src/contracts/schemas.ts`:
`evidence must never carry a score, mastery estimate, or percentage`. A game that tried to send
a judgement would be **rejected by the contract**, not merely discouraged by a convention.
**"The game does not grade the answer." / "It reports what it sees."**

**6 — One cause · 0:22.2–0:29.** The payoff of beat 1. The real 83-node graph lies as a plane in
3D; the camera banks from a steep rake to nearly flat while pushing into the fraction cluster.
Maya and Jonah drop onto the two *different* concepts they each got wrong, as the same roster
chips the dashboard draws. Both `WHOLE_NUMBER_BIAS` edges fire **backwards** and converge on
`F.MAG.UNIT`, which rings teal. A flat card names it in the graph's own words — **"A unit
fraction 1/n is one of n equal parts of a whole"** — with the provenance string under it, which
quotes the wrong answer the video opened on. **"One cause." / "No test asked about it."**

**7 — Two facts · 0:29–0:34.5.** The real Patterns tab banks in and two findings lift off it
toward camera. **Shared misconception:** two named children, one signature, one blamed root
cause. **Lost since earlier:** three concepts Maya mastered before, decayed to ~0.69 — the
system noticing forgetting that no mark on any page records. The second one is the beat; the
first is impressive, the second is the one a teacher has genuinely never been handed.
**"Neither fact fits in a grade book."**

**8 — The opening move · 0:34.5–0:39.5.** The end of the loop's second step, and the point of
the product for the person watching. The sentence types on exactly as
`buildOpeningMove()` emits it, names and concept ids and em-dash included. Twenty-nine words is
more than anyone reads in five seconds, which is why the one actionable clause is then
highlighted: the viewer registers that something real and specific arrived, and reads the part
that tells her what to physically do. **"She knows what to teach first."**

**9 — It knows when to stop · 0:39.5–0:43.** The one beat that argues against the product's own
automation. Devon has failed the same concept in three sessions, so the engine refuses to serve
it a fourth time, and says so in its own decision log: `BLOCKED · G.PART · score 0.4653 ·
wheel-spin block: attempts_without_mastery=3 >= 3`. The blocked row is thrown out of frame,
because that is exactly what the constraint does to it. **"It stops asking him. It asks you
instead."**

**10 — Three games, one judgement · 0:43–0:47.** Four seconds of engineering, told the way it
matters to her: the games her class plays can be swapped or added to, and not one of the
findings she just saw depends on which one ran. Three real game screens fan out as a 3D
carousel; the rig recedes and a terminal slab lands in front of it:
`grep -rn "games/" src/engine src/store src/analytics src/graph` → **`0 results`**.
**"Three games. One judgement."**

**11 — What Priya sees · 0:47–0:53.5.** Everything in the last thirty seconds happened on the
teacher's side. None of it reaches the child. Four real screens, each arriving on a different
axis: the star map banks in from the right (**"Priya sees none of it."**), the balance scale
whips up from below (**"She plays."**), then the celebration pushes straight at camera on a
rising teal glow and is allowed to sit still and be looked at — no caption over it. Finally the
map returns with the star bloomed. **"No score. No rank. No leaderboard." / "One star. One idea
she understands."**

**12 — The loop closes · 0:53.5–0:58.** The same three steps, now small, lit and turning, with
Fizz at one end and Ms. Chen at the other. **"Five minutes of play." / "One clear move."**
Wordmark, out. No feature list, no URL, no thanks for watching.

## 5. The copy

**All on-screen copy and the voiceover are written in Simplified Technical English.** One idea
per sentence, active voice, present tense, ordinary words, nothing that needs a second reading.
The audience is reading at four seconds a beat while also looking at a diagram; anything that
needs parsing twice is a line that fails.

The one exemption is **anything quoted verbatim from the repo or the running API** — the
contract guard message, the provenance string, the opening move, the decision-log rows, the
concept ids, the grep. Those are set in mono and are never rewritten, simplified or trimmed,
because mono means *this is real* and that promise is worth more than the reading ease of six
words. Everything set in a display or sans face is STE; everything set in mono is verbatim.

Ordinary words for everything a parent would need explained ("one star, one idea she
understands"), exact words for everything an engineer would check
(`attempts_without_mastery=3 >= 3`). Numbers appear only when a number is the point.

Every claim is on screen, so the cut reads silently; never narrate what is already legible.

## 6. Voiceover

Optional. The cut is submittable without it. If it is recorded it goes over beats **1–4 and
11–12 only** — beats 5–10 are too dense to narrate at this pace and the type already carries
them. Record in one pass, unhurried, and let each on-screen line land before speaking over the
next:

> Two children. The same wrong answer. One-eighth, put to the right of one-third — because
> eight is more than three. *(beat)* Her grade book marks them both wrong. It does not say why.
>
> So she changes how class starts. Five minutes of play. The class plays one short game, she
> reads one cause, and she teaches one thing. Every morning.
>
> *(silent through beats 5–10)*
>
> None of it reaches the child. She sees a sky, and one star for every idea she is growing.
>
> *(silent through the celebration)*
>
> No score. No streak. Nothing that compares her to anybody.
>
> Five minutes of play. One clear move.

Drop the take at `video/public/vo-teacher.wav` and uncomment the `<Audio>` in
`video/src/DemoTeacher.tsx`. Then move the beat boundaries in `TEACHER_BEATS`
(`video/src/theme.ts`) to fit the read — never the read to fit them.

## 7. Cast

Four people are drawn, in the same flat vocabulary as Fizz (`video/src/components/Cast.tsx`,
itself redrawn from `public/child/child.js`). Each child carries the **exact hue
`public/shared/styles.css` assigns their roster avatar**, keyed by their position in
`server/state.ts`'s `directory` — so Maya is the same blue on a sketch as she is on the
dashboard in the same frame.

| Who | On camera as | Verified state today |
|---|---|---|
| **Maya R.** (`stu_maya`, hue 0, blue) | Beats 1, 6, 7 | `F.MAG.CMP: STUCK` (3), `WHOLE_NUMBER_BIAS`. Three decayed concepts at p ≈ 0.69. |
| **Jonah K.** (`stu_jonah`, hue 3, amber) | Beats 1, 6, 7 | `F.MAG.CMP: STUCK` (4), `F.MAG.NONUNIT: STUCK` (3), same signature, same root cause. |
| **Devon P.** (`stu_devon`, hue 1, teal) | Beat 9 | `G.PART` blocked, `attempts_without_mastery: 3`. Routes to `numberline.place.v2` (D.NOTATE). |
| **Priya S.** (`stu_priya`, hue 2, pink) | Beat 11 | Routes to `balancescale.compare.v1` on `F.EQV`, 8 items. The real mastery transition. |
| **Ms. Chen** | Beats 2, 3, 4, 8, 12 | **Invented.** See below. |

**Ms. Chen is the one fictional element in the cut.** The app has no teacher directory, only a
cohort, so she is the audience's stand-in rather than a record in the system. She therefore
carries the tutor ground's brand green rather than a student hue, and glasses, so she never
reads as a seventh child. Nothing is ever claimed about her that the product would store.

**Beat 11 is Priya and not Maya, and that is a fact about the capture rather than a choice
about the story.** `capture.mjs` plays a real session through to a real mastery transition, and
the only seeded child it can honestly do that for is Priya: her assignment is eight non-anchor
`F.EQV` items on the balance scale, a tap game the script can answer by reading each item's own
rendered fractions. Maya's assignment is number-line placement, which is a drag, and her belief
history would not cross the mastery gate in one clean session anyway. So all four screens in
beat 11 are one child's, start to finish, rather than two children's cut together to look like
one. **Do not relabel that beat as Maya to tidy the arc.**

**Routing changes between seeds and will change again.** Re-derive this whole table on recording
day; never record from its memory.

## 8. Recording-day runbook

Everything the cut needs is already captured. This is what to re-run on the day, in order,
because belief state is wall-clock sensitive (recency half-life 30 days, grace 10) and the seed
timeline holds for about four days.

1. **Green build.** `npm test` (expect 195 passing, 19 files), `npm run typecheck` clean. A
   judge runs these.
2. **Fresh state.** `rm -rf .data && npm run seed`, then `npm run dev`. Confirm `GET
   /api/health` lists all three games and that `/child/` and `/tutor/` both return 200.
3. **Re-capture.** `cd video && node scripts/capture.mjs`. It drives headless Chrome at
   1280×800 @2x, walks the tutor tabs, opens three kids' maps and games, then plays Priya's
   balance-scale session through — answering correctly by reading each item's own rendered
   fractions — and captures the celebration and bloomed map that follow. It prints a warning
   instead of a celebration frame if the mastery transition did not fire; reseed and re-run.
4. **Re-verify every quoted string**, because each is on screen verbatim:
   - `GET /api/tutor/report/coh_demo` → `opening_move.text` (beat 8) and the two
     `clusters[].root_cause_provenance` strings (beat 6).
   - `GET /api/assignment/stu_devon` → the two `decisionLog` rows (beat 9, `S09Stop.tsx`).
   - `ObservationSchema`'s `.refine()` message in `src/contracts/schemas.ts` (beat 5).
   - `grep -rn "games/" src/engine src/store src/analytics src/graph` → must still be empty, or
     beat 10 is a lie and has to come out.
5. **Check the cut typechecks.** `cd video && npx tsc --noEmit && npx eslint src`.
6. **Render.** `cd video && npx remotion render DemoTeacher out/demo-teacher.mp4`. 1740 frames,
   1920×1080, 30fps.
7. **Watch it once at full size before submitting.** Specifically: that no caption is covered by
   a card in beats 6, 7 and 9, and that the last word of every line lands before its beat cuts.
   Both classes of fault have happened and neither shows in a still.

To work one beat at a time, every beat is registered as its own composition (`T01-SameAnswer`
… `T12-Close`) in `video/src/Root.tsx`, so the Studio can open it without scrubbing the minute.

## 9. What not to show

- **`D.NOTATE` / `D.MAG` anchor-prerequisite paradox** — still open. Don't drill into
  `D.NOTATE`'s node or dwell on a `D.MAG` anchor badge. Beat 9 shows `D.NOTATE` only as a
  decision-log row, which is safe.
- **"Blocked: 3 sessions in a row"** — the tutor renders this string, but
  `attempts_without_mastery` counts non-consecutive sessions, so it is not true as written.
  Beat 9 shows the raw `decision_log` row instead, which is. Don't put the tutor string on
  screen at a readable size.
- **"Her highest-scoring concept is the blocked one."** This *was* true of Maya and is no
  longer: on today's state `F.MAG.NONUNIT` (0.4618) outscores the blocked `F.MAG.CMP` (0.4493).
  The claim is not made anywhere in this cut. Don't reintroduce it.
- **The full stuck list**, unfiltered. Frame one example, never the whole panel.
- **Deep concept-map scrolling** — only the magnitude→fractions strand is exercised on a fresh
  seed; the rest render as fully untested. The Remotion graph in beat 6 is the safe way to show
  graph structure.
- **Raw JSON or curl output as proof.** The decision log in beat 9 and the grep in beat 10 are
  the exceptions, and both are typeset in Remotion, not screenshotted from a terminal.
- **Any dead end.** The map can glow a star that Play won't serve (a known `p_mastery`-vs-status
  split). Verify the exact screen a chosen kid lands on via a fresh `GET /api/assignment/<id>`
  before rolling, not from memory.
- **A tutor link on the child surface.** There isn't one, by decision. Don't imply one exists.
- **Ms. Chen doing anything the product stores.** She may read, decide and teach. She may not
  appear to log in, be listed, or be addressed by the app.

## 10. Verified live — 2026-09-18, HEAD `65b171d`

Server on :5173 against the existing `.data`. Read off the running app, not the README.

- `GET /api/health` → `games: ["numberline.place.v2", "balancescale.compare.v1",
  "fractionbars.compare.v1"]`, `graphVersion: "2026.09.10"`, `db: "disabled"`.
- `GET /api/tutor/report/coh_demo` → **two** clusters, both `WHOLE_NUMBER_BIAS`, both
  `["stu_maya", "stu_jonah"]`, both `root_cause: "F.MAG.UNIT"`. Beat 6 animates the first.
- `opening_move.text`, quoted verbatim in beat 8:
  `"Put Maya R., Jonah K.'s work on F.MAG.CMP side by side and ask the class to explain the
  difference -- the shared pattern is whole number bias, tracing back to F.MAG.UNIT."`
- `retention` → 10 rows, non-empty. Maya's three (beat 7): `N.ORD` p_decayed 0.6933, `N.PLACE`
  0.6815, `N.PLACE.HTH` 0.6941 — shown rounded to 0.69 / 0.68 / 0.69.
- Stuck list: 4 rows, 3 kids — maya/`F.MAG.CMP` (3), devon/`G.PART` (3), jonah/`F.MAG.CMP` (4),
  jonah/`F.MAG.NONUNIT` (3).
- `GET /api/assignment/stu_devon` decision log, quoted verbatim in beat 9: `G.PART` blocked at
  score `0.4653` with `"wheel-spin block: attempts_without_mastery=3 >= 3"`; `D.NOTATE` served
  at `0.6` with `"selected: top of frontier/uncertainty/retrieval/blame score"`.
- `GET /api/assignment/stu_priya` → `balancescale.compare.v1`, `F.EQV`, 8 items — the beat 11
  session.
- Graph (`src/graph/data/strand-magnitude-fractions.json`): **83 nodes, 127 `requires`, 7
  `explains`**, every `explains` edge carrying a `provenance` string. `F.MAG.UNIT`'s label, on
  screen in beat 6, is `"A unit fraction 1/n is one of n equal parts of a whole"`.
- `ObservationSchema` guard message, on screen in beat 5:
  `"evidence must never carry a score, mastery estimate, or percentage"`
  (`src/contracts/schemas.ts`).
- `grep -rn "games/" src/engine src/store src/analytics src/graph` → **0 results**.
- `npm test` → **195 passed, 19 files**. `npm run typecheck` → clean.
- `cd video && npx tsc --noEmit && npx eslint src` → clean.
