const app = document.getElementById("app");
// No link to the tutor view anywhere on this surface (user decision
// 2026-09-15): one tap from a child screen reached classmates' names and
// stuck flags. Tutors open /tutor/ directly.

const state = {
  student: null,
  studentHue: 0,
  assignment: null,
  items: [],
  index: 0,
  observations: [],
  sessionId: null,
  sessionStartedAt: null,
  // Guards against rapid/double tapping submitting the same item twice
  // (or skipping the next one) before the async round trip to /respond
  // completes and the next item renders. See roadmap.html C9 "Adversarial:
  // Rapid tapping".
  busy: false,
  // Session lifecycle: "playing" while items are on screen, "finishing" once
  // the bundle is being posted (or the child tapped Home), "idle" otherwise.
  // Every delayed callback (the feedback-note timeout, the balance scale's
  // settle delay) checks it, so nothing can re-render an item on top of the
  // map after the child has left the session.
  phase: "idle",
  // True only while a POST /respond is in flight. A Home tap during that
  // window is deferred until the observation lands, so it isn't lost.
  responding: false,
  quitRequested: false,
  // One-shot hand-off from the celebration screen to the Star Path: which
  // stars just bloomed / cracked a pattern this session (server-reported),
  // so the map can play their highlight once. showConstellation() reads and
  // clears it, so a later visit to the map is a normal one.
  justBloomed: null,
};

// Throws on a non-2xx response (and on a network failure, which fetch
// already rejects), so callers can show a retry instead of treating an error
// body as data.
async function api(path, opts) {
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) throw new Error(`${opts?.method ?? "GET"} /api${path} failed with ${res.status}`);
  return res.json();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function render(node) {
  app.innerHTML = "";
  app.appendChild(node);
}

// Hand-authored, stroke-based icons -- kept to the same shapes tutor.js
// uses so the two surfaces read as one visual language.
const ICONS = {
  check: '<path d="M5 13l4 4L19 7"/>',
  hourglass: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pause: '<circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="9" y2="15"/><line x1="15" y1="9" x2="15" y2="15"/>',
  // Distinct glyph for a mastery beat (a newly-mastered concept this session)
  // vs. the plain "check" used for a routine, nothing-new-happened session
  // end -- see finishSession(). Same hand-authored stroke style as the icons
  // above (no icon-library dependency): a five-point star outline.
  star: '<path d="M12 3.5l2.47 5.18 5.65.68-4.15 3.95 1.09 5.6L12 16.15l-5.06 2.76 1.09-5.6-4.15-3.95 5.65-.68z"/>',
  // The in-session Home button (back to the Star Path).
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
};
// Filled four-point sparkle, used only as decoration on bloom/fading stars
// (see .star-sparkle in index.html). Not an ICONS entry: it's a fill shape,
// not the stroke style icon() draws.
const SPARKLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5C12.9 8.4 15.6 11.1 22.5 12 15.6 12.9 12.9 15.6 12 22.5 11.1 15.6 8.4 12.9 1.5 12 8.4 11.1 11.1 8.4 12 1.5Z"/></svg>';
function icon(name, cls = "icon") {
  return el("span", { class: cls, html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ""}</svg>` });
}
function initials(name) {
  return name.replace(/\./g, "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
function avatar(name, hue, cls = "") {
  return el("span", { class: `avatar ${cls}`, "data-hue": String(hue % 6) }, initials(name));
}

// -------------------- Fizz (see DESIGN_LANGUAGE.md) --------------------
// The one mascot every screen on this surface shares -- a species-neutral
// "spark critter" so it never competes with a game's own subject matter
// (no ears to clash with a fraction bar, no fur to look wrong next to a
// balance scale). Colors come from .fizz-* classes in index.html, which
// themselves resolve to this page's existing --play accent and the shared
// --status-mastered reward color -- Fizz never introduces a new hue.
// `pose` only ever adds a one-shot CSS animation class (see index.html's
// fizz-hop/fizz-cheer keyframes); it never changes Fizz's shape.
const FIZZ_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <ellipse class="fizz-body" cx="50" cy="60" rx="34" ry="30"/>
  <ellipse class="fizz-belly" cx="50" cy="70" rx="20" ry="14"/>
  <path class="fizz-spark" d="M50 30 C 46 18, 54 10, 60 6 C 56 16, 58 24, 52 32 Z"/>
  <rect class="fizz-stem" x="48.5" y="28" width="3" height="10" rx="1.5"/>
  <circle class="fizz-eye" cx="38" cy="55" r="10"/><circle class="fizz-eye" cx="62" cy="55" r="10"/>
  <circle class="fizz-pupil" cx="40" cy="57" r="4.5"/><circle class="fizz-pupil" cx="64" cy="57" r="4.5"/>
  <circle class="fizz-cheek" cx="28" cy="66" r="6"/><circle class="fizz-cheek" cx="72" cy="66" r="6"/>
  <ellipse class="fizz-body" cx="34" cy="88" rx="9" ry="5"/><ellipse class="fizz-body" cx="66" cy="88" rx="9" ry="5"/>
</svg>`;
function fizz(size = "md", pose = "", cls = "") {
  const poseClass = pose === "hop" ? "fizz-hop" : pose === "cheer" ? "fizz-cheer" : "";
  return el("span", { class: `fizz fizz--${size} ${poseClass} ${cls}`.trim(), "aria-hidden": "true", html: FIZZ_SVG });
}

// Shared loading indicator (see .spinner in shared/styles.css) -- swaps the
// bare "Loading..." text both async views below used to render for a small
// breathing-dots animation, so a wait reads as "working" rather than as a
// screen that failed to render.
function loadingCard(label = "Loading...") {
  return el("div", { class: "screen screen--center" }, [
    el("div", { class: "empty-card" }, [
      el("div", { class: "loading-row" }, [el("span", { class: "spinner" }, [el("span", {}), el("span", {}), el("span", {})]), label]),
    ]),
  ]);
}

// Plain-English display names for the graph's strand codes -- words only,
// never a count or ranking. Kept local to this file rather than imported
// from tutor.js (a different surface with a different bundling story), but
// intentionally the exact same strings tutor.js's STRAND_LABEL uses so the
// two surfaces read as one vocabulary.
const STRAND_LABEL = {
  NUMBER: "Whole numbers",
  OPERATIONS: "Operations",
  ALGEBRA: "Patterns & algebra",
  GEOMETRY: "Geometry",
  MEASUREMENT: "Measurement",
  DATA: "Data & graphs",
  FRACTION: "Fractions",
  DECIMAL: "Decimals",
};

// -------------------- picker --------------------

// Picking a player opens their Star Path (the map is home); Play starts
// from there.
async function showPicker() {
  const directory = await api("/directory");
  // Big avatar cards, fading up in a quick stagger (capped, one-shot).
  const cards = directory.map((d, i) =>
    el(
      "button",
      { type: "button", class: "picker-play", "data-hue": String(i % 6), style: `animation-delay: ${Math.min(i * 50, 400)}ms`, onclick: () => showConstellation(d, i) },
      [avatar(d.name, i, "picker-avatar"), el("span", { class: "picker-name" }, d.name)],
    ),
  );
  render(
    el("div", { class: "screen screen--picker" }, [
      el("div", { class: "picker-head" }, [
        fizz("lg"),
        el("div", { class: "speech-bubble" }, [el("h1", {}, "Who's playing?"), el("span", { class: "speech-note" }, "Tap your name to visit your stars.")]),
      ]),
      el("div", { class: "picker-scroll" }, [el("div", { class: "picker" }, cards)]),
    ]),
  );
}

// -------------------- Star Path (the child's home map) --------------------

// Kid-voice names for the authored concepts -- the only concept names a
// child ever sees. Hard rules (see DESIGN_LANGUAGE.md "Star Path"): short and
// concrete, no digits, no fraction glyphs, no "1/n". The graph's own labels
// are tutor-facing and never reach this surface. An authored concept missing
// from this map falls back to a generic name rather than leaking a label.
const CHILD_LABEL = {
  "N.COUNT": "Counting up",
  "N.ORD": "Putting numbers in order",
  "N.MAG": "Where numbers live on a line",
  "N.PLACE": "Tens and ones",
  "N.PLACE.HTH": "Hundreds, tens and ones",
  "G.PART": "Sharing into equal parts",
  "G.PART.UNEQUAL": "Spotting unfair shares",
  "F.NOTATE": "Reading a fraction",
  "F.MAG.UNIT": "One equal piece of a whole",
  "F.MAG.NONUNIT": "Several equal pieces",
  "F.EQV": "Same amount, different fractions",
  "F.MAG.CMP": "Comparing fractions",
  "D.NOTATE": "Tenths and hundredths",
  "D.MAG": "Where decimals live on a line",
  "D.MAG.CMP": "Comparing decimals",
};
const childLabel = (conceptId) => CHILD_LABEL[conceptId] ?? "A brand-new star";

// What Fizz adds after a star's name. Words only, never a count or rank.
// "fading" is framed as care ("would love to see you again"), never as loss.
const TIER_NOTE = {
  seed: "A little seed star, waiting to grow.",
  glow: "You're growing this one.",
  bloom: "This one's shining bright!",
  fading: "This one would love to see you again.",
};
// Deliberately does NOT say Play goes here: the server's `next` is only a
// map highlight, and the session itself is still chosen by the engine (a
// kid-ux spot check found it differed for most seeded students). "Soon" and
// Fizz's "I think" keep it a hint, not a promise about the next Play.
const NEXT_NOTE = "I think this one is ready to grow soon!";
// Fizz's line when the map opens from the celebration screen.
const JUST_BLOOMED_NOTE = "Look, your star just bloomed!";
const JUST_CRACKED_NOTE = "You figured out a tricky part here!";

const TIER_A11Y = { seed: "seed star", glow: "growing star", bloom: "shining star", fading: "star to revisit" };

// The map as home. Everything judgement-shaped (which concepts, which tier,
// which star glows) comes from GET /api/child/map/:studentId -- this
// function never sees a probability and never decides anything. It is also
// the only place a child's session starts from (the Play button).
async function showConstellation(student, hue = 0) {
  state.student = student;
  state.studentHue = hue;
  const justBloomed = state.justBloomed;
  state.justBloomed = null;
  render(loadingCard());
  const map = await api(`/child/map/${student.student_id}`);
  const bloomedIds = new Set(justBloomed?.bloomed ?? []);
  const crackedIds = new Set(justBloomed?.cracked ?? []);
  const focusButton = { current: null };
  const conceptById = new Map(map.concepts.map((c) => [c.concept_id, c]));

  // Fizz narrates from one fixed spot above the scroll area, so the bubble
  // is always visible no matter which trail the tapped star sits on.
  const fizzSlot = el("div", { class: "map-fizz" }, [fizz("lg")]);
  const bubble = el("div", { class: "speech-bubble", "aria-live": "polite" });
  function say(name, note) {
    bubble.replaceChildren(...[name ? el("span", { class: "speech-name" }, name) : null, el("span", { class: "speech-note" }, note)].filter(Boolean));
  }
  // The opening line doesn't point at the coral `next` star: it shares the
  // Play button's colour, and saying "see the glowing star?" right above Play
  // reads as "Play goes there" when the engine may pick something else.
  say(null, "Tap a star. I'll tell you its name!");

  let selected = null;
  function onStarTap(concept, button) {
    if (selected) selected.classList.remove("const-star--selected");
    selected = button;
    button.classList.add("const-star--selected");
    const note = concept.next && concept.tier !== "fading" && concept.tier !== "bloom" ? NEXT_NOTE : TIER_NOTE[concept.tier];
    say(childLabel(concept.concept_id), note);
    // Re-mount Fizz so the one-shot hop replays on every tap.
    fizzSlot.replaceChildren(fizz("lg", "hop"));
  }

  // A running index across the whole map so the twinkle-in reads as one
  // cascade. Purely decorative; never gates anything tappable.
  let starIndex = 0;
  const trails = map.strands
    .filter((s) => s.concept_ids.length > 0)
    .map((s) => {
      // Stars alternate above/below the row's midline and a curved step
      // joins each pair, so a strand reads as a winding path (purely
      // positional -- see .trail-slot/.trail-step in index.html).
      const row = [];
      s.concept_ids.forEach((id, i) => {
        if (i > 0) row.push(trailStep(i % 2 === 1 ? "down" : "up"));
        const concept = conceptById.get(id);
        // The just-bloomed highlight only plays if the server's map agrees
        // the star is bloom now; a cracked pattern pops the star in its tier.
        const highlight = bloomedIds.has(id) && concept?.tier === "bloom" ? "bloomed" : crackedIds.has(id) || bloomedIds.has(id) ? "cracked" : null;
        const button = starNode(concept, starIndex++, onStarTap, slotFor(i), highlight);
        if (id === justBloomed?.focus) focusButton.current = button;
        row.push(button);
      });
      if (s.hasComingLater) {
        const n = s.concept_ids.length;
        row.push(trailStep(n % 2 === 1 ? "down" : "up", true));
        row.push(el("span", { class: `trail-more ${slotFor(n)}`, "aria-hidden": "true" }, [el("span"), el("span"), el("span")]));
      }
      return el("section", { class: "trail" }, [
        el("h2", { class: "const-strand-title" }, STRAND_LABEL[s.strand] ?? "More stars"),
        el("div", { class: "trail-row" }, row),
      ]);
    });
  // The longest trail's star and connector counts, so CSS can stretch the
  // step length to fill the map card (see --step on .trail-row). Layout
  // only: these land in an inline style, never in text or aria.
  const drawn = map.strands.filter((s) => s.concept_ids.length > 0);
  const maxStars = Math.max(1, ...drawn.map((s) => s.concept_ids.length));
  const maxSteps = Math.max(1, ...drawn.map((s) => s.concept_ids.length - 1 + (s.hasComingLater ? 1 : 0)));
  // One short line, no list of strand names: "Patterns & algebra" is not
  // first-grade reading, and a list of things you can't do yet is noise.
  const hasComingStrands = map.strands.some((s) => s.concept_ids.length === 0 && s.hasComingLater);
  const comingLine = hasComingStrands ? el("p", { class: "trail-coming" }, "More star trails coming soon!") : null;

  render(
    el("div", { class: "screen screen--map" }, [
      el("div", { class: "topbar" }, [
        el("div", { class: "who" }, [avatar(student.name, hue), student.name]),
        el("button", { class: "pill-link const-back", onclick: showPicker }, "Change player"),
      ]),
      el("div", { class: "map-layout" }, [
        el("div", { class: "map-head" }, [bubble, fizzSlot]),
        el("div", { class: "const-scroll" }, [el("div", { class: "const-body", style: `--stars: ${maxStars}; --steps: ${maxSteps}` }, [...trails, comingLine])]),
        el("div", { class: "map-play-row" }, [
          el("button", { class: "btn-primary map-play", onclick: () => startSession(student, hue) }, [icon("arrow"), "Play"]),
        ]),
      ]),
    ]),
  );

  // Arriving from the celebration: Fizz cheers and names the star, which is
  // marked selected and brought into view inside the map card (the map's
  // own internal scroll, never the page).
  if (justBloomed && focusButton.current) {
    const concept = conceptById.get(justBloomed.focus);
    const b = focusButton.current;
    selected = b;
    b.classList.add("const-star--selected");
    say(childLabel(justBloomed.focus), justBloomed.focusKind === "bloomed" && concept?.tier === "bloom" ? JUST_BLOOMED_NOTE : JUST_CRACKED_NOTE);
    fizzSlot.replaceChildren(fizz("lg", "cheer"));
    const scroller = app.querySelector(".const-scroll");
    if (scroller) {
      const sr = scroller.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      scroller.scrollTop += br.top - sr.top - (sr.height - br.height) / 2;
      scroller.scrollLeft += br.left - sr.left - (sr.width - br.width) / 2;
    }
  }
}

const slotFor = (i) => (i % 2 === 0 ? "trail-slot--up" : "trail-slot--down");

// One curved connector between two neighbouring stars. `dir` is which way
// the path travels (the previous star is up and the next is down, or the
// reverse); `fade` is the trailing step into the "more coming" dots.
function trailStep(dir, fade = false) {
  const [y0, y1] = dir === "down" ? [0, 40] : [40, 0];
  const d = `M0 ${y0} C50 ${y0} 50 ${y1} 100 ${y1}`;
  return el("span", {
    class: `trail-step${fade ? " trail-step--fade" : ""}`,
    "aria-hidden": "true",
    html: `<svg viewBox="0 0 100 40" preserveAspectRatio="none"><path class="trail-road" d="${d}" vector-effect="non-scaling-stroke"/><path class="trail-dots" d="${d}" vector-effect="non-scaling-stroke"/></svg>`,
  });
}

// `highlight` is the one-shot arrival from the celebration screen:
// "bloomed" plays glow -> bloom (a glow-tier overlay that melts away), and
// "cracked" plays a single teal pulse on the star as it is.
function starNode(concept, index, onTap, slotClass = "", highlight = null) {
  const tier = concept?.tier ?? "seed";
  // Cascading entrance delay, capped so the whole map twinkles in quickly.
  const delayMs = Math.min(index * 40, 560);
  const highlightClass = highlight === "bloomed" ? " const-star--just-bloomed" : highlight === "cracked" ? " const-star--just-cracked" : "";
  const cls = `const-star const-star--${tier}${concept?.next ? " const-star--next" : ""}${highlightClass} ${slotClass}`.trim();
  const button = el(
    "button",
    {
      type: "button",
      class: cls,
      style: `animation-delay: ${delayMs}ms`,
      "aria-label": `${childLabel(concept?.concept_id)}, ${TIER_A11Y[tier]}`,
    },
    [
      highlight === "bloomed" ? el("span", { class: "star-was-glow", "aria-hidden": "true" }, [icon("star")]) : null,
      icon("star"),
      // Bloom gets two sparkles; fading keeps a softer one (CSS hides the
      // second) so it reads as the same star gone quiet, not a broken one.
      ...(tier === "bloom" || tier === "fading"
        ? [el("span", { class: "star-sparkle star-sparkle--a", html: SPARKLE_SVG }), el("span", { class: "star-sparkle star-sparkle--b", html: SPARKLE_SVG })]
        : []),
    ],
  );
  button.addEventListener("click", () => onTap(concept, button));
  return button;
}

async function startSession(student, hue = 0) {
  state.student = student;
  state.studentHue = hue;
  render(loadingCard());
  const result = await api(`/assignment/${student.student_id}`);
  if (!result.assignment) {
    showEmpty(result);
    return;
  }
  state.assignment = result.assignment;
  state.sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  state.sessionStartedAt = new Date().toISOString();
  state.observations = [];
  state.busy = false;
  state.responding = false;
  state.quitRequested = false;
  state.index = 0;

  const ids = state.assignment.item_specs.map((s) => s.item_id).join(",");
  state.items = await api(`/items/${state.assignment.game_id}?ids=${ids}`);

  state.phase = "playing";
  showItem();
}

// The engine can return no assignment for two very different reasons, and
// showing them identically ("All done!") is dishonest -- a kid (or a judge
// clicking through demo accounts) can't tell "you've mastered everything"
// from "the engine is temporarily stuck and has nothing safe to serve".
// See BACKLOG.md dead-end fix: this used to read as a cheerful success
// screen even when `reason` was "every candidate was blocked by a hard
// constraint". Three distinct states, not one:
//   1. Genuinely nothing left to master right now -- true "all done".
//   2. A concept the child was working on hit the wheel-spin limit and got
//      escalated -- there IS something to do, it's just a person's turn now.
//   3. Everything reachable is hard-blocked for some other reason (a
//      prerequisite gate, a coverage gap) -- not mastery, just stuck.
// Whitelisted, not blacklisted: only the engine's own explicit "everything
// reachable is mastered" reason counts as genuinely done. Any other reason
// -- including ones this file doesn't know about yet -- defaults to "not
// the same as done", which is the honest default when unsure.
const GENUINELY_DONE_REASON = /mastered, stuck, or unreachable/;

function showEmpty(result) {
  const reason = result.reason || "";
  const hasEscalations = Boolean(result.escalations && result.escalations.length > 0);
  const isHardBlocked = hasEscalations || !GENUINELY_DONE_REASON.test(reason);

  let heading, message, iconName;
  // Copy is written for a 6-8 year old reader: short sentences, no dashes,
  // no "isn't the same as". The three states still say three different
  // things: finished for now / a grown-up is helping / new things are coming.
  if (!isHardBlocked) {
    heading = "All done for now!";
    message = "You played everything that's ready. Come back soon for more!";
    iconName = "hourglass";
  } else if (hasEscalations) {
    heading = "Time for a little break";
    message = "Your teacher is going to help you with this one. Come back later to play!";
    iconName = "pause";
  } else {
    heading = "Nothing to play just yet";
    message = "New things to play are on the way. Come back in a little while!";
    iconName = "pause";
  }

  render(
    el("div", { class: "screen screen--center" }, [
      el("div", { class: "empty-card" }, [
        el("div", { class: "icon-wrap" }, [icon(iconName)]),
        el("h2", {}, heading),
        el("p", {}, message),
        el("button", { class: "btn-primary", onclick: () => showConstellation(state.student, state.studentHue) }, "Back to my stars"),
      ]),
    ]),
  );
}

// -------------------- gameplay --------------------

function currentSpec() {
  return state.assignment.item_specs[state.index];
}
function currentItem() {
  const spec = currentSpec();
  if (!spec) return undefined;
  return state.items.find((i) => i.item_id === spec.item_id);
}

// Fizz's home across every item type below: one shared path of `total`
// nodes (one per item in the assignment), Fizz standing on whichever node
// `index` is currently at. This is the actual answer to "the UI language
// must stay the same across games" -- numberline/compare/partition/balance
// all render wildly different stages above, but every one of them ends up
// funneled through this exact same component for "how far am I", because
// they already share this one call site. See DESIGN_LANGUAGE.md before
// adding a fifth item type that bypasses this.
function pathTrack(total, index, { justAdvanced = false } = {}) {
  const count = Math.max(total, 1);
  const posFor = (i) => {
    const t = count > 1 ? i / (count - 1) : 0.5;
    return { x: 6 + t * 88, y: 66 - Math.sin(t * Math.PI) * 40 };
  };
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const { x, y } = posFor(i);
    nodes.push(el("div", { class: "path-node" + (i < index ? " path-node--done" : ""), style: `left:${x}%; top:${y}%` }));
  }
  const fizzIndex = Math.min(index, count - 1);
  const { x: fx, y: fy } = posFor(fizzIndex);
  const fizzNode = el("div", { class: "path-fizz", style: `left:${fx}%; top:${fy}%` }, [fizz("md", justAdvanced ? "hop" : "")]);

  // No text under the track: the nodes and Fizz's position are the whole
  // progress signal. (A "N to go" chip used to sit here; it was the one digit
  // in a session and was removed -- see DESIGN_LANGUAGE.md "The path track".)
  return el("div", { class: "path-wrap" }, [el("div", { class: "path-track", "aria-hidden": "true" }, [...nodes, fizzNode])]);
}

// The topbar every in-session screen shares: who's playing, and a Home
// button back to the Star Path (see quitSession).
function sessionTopbar() {
  return el("div", { class: "topbar" }, [
    el("div", { class: "who" }, [avatar(state.student.name, state.studentHue), state.student.name]),
    el("button", { type: "button", class: "pill-link session-home", onclick: quitSession }, [icon("home"), "Home"]),
  ]);
}

// Home mid-session. With nothing answered yet there's no evidence to keep,
// so it just goes back to the map. With at least one answer, the partial
// session is posted as an abandoned bundle (completed:false) first, so the
// answers the child did give still count. A tap while an answer is still
// being sent waits for it to land (see submitAndAdvance).
function quitSession() {
  if (state.phase !== "playing") return;
  if (state.responding) {
    state.quitRequested = true;
    return;
  }
  if (state.observations.length === 0) {
    state.phase = "idle";
    showConstellation(state.student, state.studentHue);
    return;
  }
  // Tapped during the last item's feedback beat: every item was answered, so
  // it's a completed session, not an abandoned one.
  finishSession(state.index >= state.assignment.item_specs.length);
}

function showItem() {
  if (state.phase !== "playing") return;
  const item = currentItem();
  if (!item) {
    finishSession(true);
    return;
  }
  const startedAtMs = Date.now();

  let stage;
  if (state.assignment.game_id === "numberline.place.v2") {
    stage = renderNumberline(item, startedAtMs);
  } else if (state.assignment.game_id === "balancescale.compare.v1") {
    stage = renderBalanceScale(item, startedAtMs);
  } else if (item.kind === "partition") {
    stage = renderPartition(item, startedAtMs);
  } else {
    stage = renderCompare(item, startedAtMs);
  }

  render(
    el("div", { class: "screen" }, [
      sessionTopbar(),
      el("div", { class: "stage" }, stage),
      pathTrack(state.assignment.item_specs.length, state.index),
    ]),
  );
}

function renderNumberline(item, startedAtMs) {
  const [lo, hi] = item.scale;
  const width = 560;
  const margin = 20;
  const trackY = 60;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} 110`);

  const track = document.createElementNS(svg.namespaceURI, "line");
  track.setAttribute("x1", margin);
  track.setAttribute("x2", width - margin);
  track.setAttribute("y1", trackY);
  track.setAttribute("y2", trackY);
  track.setAttribute("class", "line-track");
  svg.appendChild(track);

  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const x = margin + frac * (width - 2 * margin);
    const tick = document.createElementNS(svg.namespaceURI, "line");
    tick.setAttribute("x1", x);
    tick.setAttribute("x2", x);
    tick.setAttribute("y1", trackY - 8);
    tick.setAttribute("y2", trackY + 8);
    tick.setAttribute("class", "line-tick");
    svg.appendChild(tick);
  }
  const loLabel = document.createElementNS(svg.namespaceURI, "text");
  loLabel.setAttribute("x", margin);
  loLabel.setAttribute("y", trackY + 30);
  loLabel.setAttribute("class", "line-tick-label");
  loLabel.textContent = String(lo);
  svg.appendChild(loLabel);
  const hiLabel = document.createElementNS(svg.namespaceURI, "text");
  hiLabel.setAttribute("x", width - margin - 14);
  hiLabel.setAttribute("y", trackY + 30);
  hiLabel.setAttribute("class", "line-tick-label");
  hiLabel.textContent = String(hi);
  svg.appendChild(hiLabel);

  // Place -> adjust -> lock in. A tap (or press-and-drag) anywhere on the
  // line places the marker and moves it as often as the child likes; nothing
  // is sent until "Lock it in". The observation's timing still spans from the
  // item appearing to the lock-in tap.
  let marker = null;
  let value = null;
  let dragging = false;
  let locked = false;

  function placeAt(clientX) {
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const localX = (clientX - rect.left) * scaleX;
    value = Math.max(0, Math.min(1, (localX - margin) / (width - 2 * margin)));

    if (!marker) {
      marker = document.createElementNS(svg.namespaceURI, "circle");
      marker.setAttribute("r", 11);
      marker.setAttribute("cy", trackY);
      marker.setAttribute("class", "line-marker");
      svg.appendChild(marker);
    }
    marker.setAttribute("cx", margin + value * (width - 2 * margin));
    lockBtn.disabled = false;
  }

  svg.addEventListener("pointerdown", (e) => {
    if (locked) return;
    dragging = true;
    svg.classList.add("is-dragging");
    svg.setPointerCapture?.(e.pointerId);
    placeAt(e.clientX);
  });
  svg.addEventListener("pointermove", (e) => {
    if (dragging && !locked) placeAt(e.clientX);
  });
  const endDrag = () => {
    dragging = false;
    svg.classList.remove("is-dragging");
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  const lockBtn = el("button", { type: "button", class: "btn-primary line-lock", disabled: "" }, "Lock it in");
  lockBtn.addEventListener("click", () => {
    if (locked || value == null) return;
    locked = true;
    lockBtn.disabled = true;
    svg.classList.add("is-locked");
    submitAndAdvance({ item_id: item.item_id, value, startedAtMs, endedAtMs: Date.now() }).catch(() => {
      // The answer didn't reach the server: unlock so the child can try again.
      locked = false;
      lockBtn.disabled = false;
      svg.classList.remove("is-locked");
    });
  });

  const lineArea = el("div", { class: "line-area" }, []);
  lineArea.appendChild(svg);

  return [
    el("div", { class: "prompt" }, item.prompt),
    el("div", { class: "subprompt" }, "Tap the line. Move it if you want, then lock it in."),
    lineArea,
    lockBtn,
  ];
}

function renderCompare(item, startedAtMs) {
  // data-hue: a fixed blue/magenta pair for side a/b (see .choice-card[data-hue]
  // in index.html) -- purely a stable left/right color convention, not a hint:
  // which side holds the bigger fraction is randomized by the item generator,
  // independent of `side`.
  function card(side) {
    const f = item[side];
    // An area model, not a progress bar: both bars are the same total length
    // (one whole), cut into `denominator` equal cells with the first
    // `numerator` shaded. The child has to see how big each piece is and how
    // many are shaded, rather than reading off a single fill width.
    const cells = [];
    for (let i = 0; i < f.denominator; i++) {
      cells.push(el("div", { class: "bar-cell" + (i < f.numerator ? " fill" : "") }));
    }
    return el(
      "div",
      { class: "choice-card", "data-hue": side === "a" ? "0" : "2", onclick: () => submitAndAdvance({ item_id: item.item_id, choice: side, startedAtMs, endedAtMs: Date.now() }) },
      [el("div", { class: "bar-outer" }, cells), el("div", { class: "bar-label" }, `${f.numerator}/${f.denominator}`)],
    );
  }
  return [el("div", { class: "prompt" }, "Which is bigger?"), el("div", { class: "choice-row" }, [card("a"), card("b")])];
}

// Balance Scale (BACKLOG.md "Balance Scale"; reworked per pedagogy-reviewer
// REQUIRED CHANGES): the beam-and-two-pans SVG still shows both fraction
// weights, but the tappable targets are now two choice buttons below it --
// "Balances" / "Doesn't Balance" -- not the pans themselves. Tapping a pan
// made this read as "pick the bigger/smaller side" (a magnitude-comparison
// gesture); F.EQV asks an equivalence question ("are these the same
// amount?"), which only a genuine balances/doesn't-balance forced choice
// actually tests. On resolution the beam settles to the *true* physical
// relationship (level if the two fractions are truly equal, tipped toward
// the larger one otherwise) -- a balance scale showing its own honest
// physics is part of the visual metaphor, never a result/leaderboard readout;
// the child still never sees a correct/incorrect label anywhere (see
// submitAndAdvance's answer-independent ACK_LINES).
function renderBalanceScale(item, startedAtMs) {
  const width = 560;
  const height = 230;
  const pivotX = width / 2;
  const pivotY = 82;
  const standBottomY = 186;
  const beamHalf = 108;
  const stringLen = 58;
  const panW = 70;
  const panH = 30;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "balance-svg");

  function shape(tag, attrs) {
    const node = document.createElementNS(svg.namespaceURI, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  }

  svg.appendChild(
    shape("polygon", {
      points: `${pivotX - 34},${standBottomY} ${pivotX + 34},${standBottomY} ${pivotX},${pivotY}`,
      class: "balance-fulcrum",
    }),
  );
  svg.appendChild(shape("line", { x1: pivotX - 48, x2: pivotX + 48, y1: standBottomY, y2: standBottomY, class: "balance-base" }));

  const pivotGroup = shape("g", { transform: `translate(${pivotX},${pivotY})` });
  const beamGroup = shape("g", { class: "balance-beam", transform: "rotate(0 0 0)" });
  beamGroup.appendChild(shape("line", { x1: -beamHalf, x2: beamHalf, y1: 0, y2: 0, class: "balance-beam-line" }));
  beamGroup.appendChild(shape("circle", { cx: 0, cy: 0, r: 6, class: "balance-pivot-cap" }));

  // Pans are display-only now (no click handler, no oversized hit-rect --
  // the tappable surface moved to the two choice buttons below). The visual
  // shape/label rendering is otherwise unchanged from the original build.
  function panAssembly(side, weight) {
    const sign = side === "left" ? -1 : 1;
    const x = sign * beamHalf;
    const group = shape("g", { class: "balance-pan-wrap", "data-side": side });
    group.appendChild(shape("line", { x1: x, x2: x, y1: 0, y2: stringLen, class: "balance-string" }));
    const panPath = `M ${x - panW / 2} ${stringLen} L ${x + panW / 2} ${stringLen} L ${x + panW / 2 - 9} ${stringLen + panH} L ${x - panW / 2 + 9} ${stringLen + panH} Z`;
    group.appendChild(shape("path", { d: panPath, class: "balance-pan" }));
    const label = shape("text", { x, y: stringLen + panH / 2 + 5, class: "balance-pan-label", "text-anchor": "middle" });
    label.textContent = `${weight.numerator}/${weight.denominator}`;
    group.appendChild(label);
    return group;
  }

  beamGroup.appendChild(panAssembly("left", item.left));
  beamGroup.appendChild(panAssembly("right", item.right));
  pivotGroup.appendChild(beamGroup);
  svg.appendChild(pivotGroup);

  // Cross-multiplication, same exact-equality test classify.ts uses server-
  // side -- this copy is purely for the visual settle animation (which way,
  // if any, the beam should honestly tip) and never substitutes for the
  // server's verdict; classifyTip(), not this, is what the belief model
  // actually sees.
  const trulyBalances = item.left.numerator * item.right.denominator === item.right.numerator * item.left.denominator;
  const tiltAngle = trulyBalances ? 0 : decimalOfClient(item.left) > decimalOfClient(item.right) ? -12 : 12;
  function decimalOfClient(w) {
    return w.numerator / w.denominator;
  }

  // Guards the same double-tap window submitAndAdvance's state.busy guards
  // elsewhere, but locally: the tilt-then-settle animation below delays the
  // actual submitAndAdvance call by 260ms, a window state.busy (only set
  // inside submitAndAdvance) doesn't cover on its own.
  let settled = false;
  function handleChoice(choice) {
    if (settled) return;
    settled = true;
    const endedAtMs = Date.now(); // captured at the moment of the tap, not after the decorative settle delay
    beamGroup.setAttribute("transform", `rotate(${tiltAngle} 0 0)`);
    setTimeout(() => {
      submitAndAdvance({ item_id: item.item_id, choice, startedAtMs, endedAtMs });
    }, 260);
  }

  const area = el("div", { class: "balance-area" }, []);
  area.appendChild(svg);

  // data-hue: purple/amber, see .balance-choice[data-hue] in index.html --
  // a fixed pair for this game's two buttons, distinct from renderCompare/
  // renderPartition's blue/magenta so the palette varies across game types.
  const choices = el("div", { class: "choice-row balance-choice-row" }, [
    el("div", { class: "balance-choice", "data-hue": "4", onclick: () => handleChoice("balances") }, "Balances"),
    el("div", { class: "balance-choice", "data-hue": "3", onclick: () => handleChoice("doesnt_balance") }, "Doesn't Balance"),
  ]);

  return [
    el("div", { class: "prompt" }, "Does it balance?"),
    el("div", { class: "subprompt" }, "Look at both sides, then choose"),
    area,
    choices,
  ];
}

function renderPartition(item, startedAtMs) {
  // Same fixed blue/magenta data-hue convention renderCompare uses -- see
  // the comment there.
  function shape(side) {
    const equal = side === item.correct;
    const slices = [];
    for (let i = 0; i < item.parts; i++) {
      const uneven = !equal && i === 0;
      slices.push(el("div", { class: "partition-slice" + (i % 2 === 0 ? " fill" : ""), style: uneven ? "flex:2" : "" }));
    }
    return el(
      "div",
      { class: "choice-card", "data-hue": side === "a" ? "0" : "2", onclick: () => submitAndAdvance({ item_id: item.item_id, choice: side, startedAtMs, endedAtMs: Date.now() }) },
      [el("div", { class: "partition-shape" }, slices)],
    );
  }
  const word = PARTITION_WORDS[item.parts];
  return [el("div", { class: "prompt" }, word ? `Which shows equal ${word}?` : "Which shows equal parts?"), el("div", { class: "choice-row" }, [shape("a"), shape("b")])];
}

// Mirrors PARTITION_WORDS in server/routes.ts (the tutor's replay labels).
// A part count missing here falls back to "equal parts" rather than the
// server's `${n}ths`, which would put a digit on the child surface.
const PARTITION_WORDS = { 2: "halves", 3: "thirds", 4: "fourths", 5: "fifths", 6: "sixths" };

// What the child sees between items, whatever the answer was. Picked at
// random (never twice in a row) so it doesn't read as a canned beep, but
// never tied to correctness, a streak, or a count -- every line must be one
// a child could hear after any answer, including the last one (so no "next one").
const ACK_LINES = ["Nice!", "Got it!", "Thanks!", "Okay!", "On we go!"];
let lastAck = -1;
function nextAck() {
  let i = Math.floor(Math.random() * ACK_LINES.length);
  if (i === lastAck) i = (i + 1) % ACK_LINES.length;
  lastAck = i;
  return ACK_LINES[i];
}

async function submitAndAdvance(payload) {
  if (state.phase !== "playing") return; // e.g. a balance-scale settle delay firing after Home
  if (state.busy) return; // a tap is already in flight for this item -- ignore extra taps
  state.busy = true;
  state.responding = true;
  let observation;
  try {
    observation = await api(`/games/${state.assignment.game_id}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, attempts: 1 }),
    });
  } catch (err) {
    state.responding = false;
    state.busy = false;
    if (state.quitRequested) {
      // Home was tapped while this (failed) answer was on its way: leave
      // anyway with whatever was already kept.
      state.quitRequested = false;
      quitSession();
      return;
    }
    throw err;
  }
  state.responding = false;
  state.observations.push(observation);
  state.index += 1;
  if (state.quitRequested) {
    // Home was tapped while this answer was on its way; it's kept now.
    state.quitRequested = false;
    state.busy = false;
    quitSession();
    return;
  }
  render(
    el("div", { class: "screen" }, [
      sessionTopbar(),
      el("div", { class: "stage" }, [el("div", { class: "feedback-note" }, [el("span", { class: "icon-wrap" }, [icon("check")]), nextAck()])]),
      pathTrack(state.assignment.item_specs.length, state.index, { justAdvanced: true }),
    ]),
  );
  setTimeout(() => {
    state.busy = false;
    showItem();
  }, 420);
}

// Turns the server's newlyMastered list into one plain-language beat per
// concept -- never a count ("2 concepts mastered"), never a rate or streak,
// and never a join of two names into one sentence. The name is ALWAYS the
// kid-voice CHILD_LABEL for the concept_id; the server's `label` field is the
// graph's tutor-facing label (e.g. "A unit fraction 1/n is one of n equal
// parts of a whole") and must never be rendered here. An authored concept
// missing from CHILD_LABEL gets a generic line rather than a leaked label.
// See BACKLOG.md B2 "Mastery Moment": this only ever reflects a same-session
// transition the server already diffed (newlyMastered on the /evidence
// response), so it's a one-time reward tied to the belief model, not a
// client-side counter or a display of standing status.
// Returns an array of one independently-complete string per concept -- callers
// render each entry as its own element rather than joining them.
function masteryBeatText(newlyMastered) {
  return newlyMastered.map((m) => {
    const name = CHILD_LABEL[m?.concept_id];
    return name ? `You've got it — ${name}!` : "You've got it — a new star is shining!";
  });
}

// Builds the session's evidence bundle once (so a retry re-sends the exact
// same bundle, same session_id and timestamps) and posts it. `completed:false`
// is the Home-button path: a valid abandoned bundle (abandoned_at set,
// ended_at never before started_at) the tutor lists as "abandoned".
function finishSession(completed) {
  state.phase = "finishing";
  const now = new Date().toISOString();
  const bundle = {
    session_id: state.sessionId,
    student_id: state.student.student_id,
    assignment_id: state.assignment.assignment_id,
    game_id: state.assignment.game_id,
    started_at: state.sessionStartedAt,
    ended_at: now,
    observations: state.observations.slice(),
    engagement: { completed, abandoned_at: completed ? null : now, idle_ms: 0 },
  };
  postBundle(bundle, 0);
}

// Spinner while the bundle is sent; a friendly retry card if it fails,
// never a frozen screen. A resend of a bundle the server already stored
// comes back 200 with duplicate:true, which is treated as success. After a
// second failure the card also offers the way home, so a child is never
// trapped on it (the answers from that session are then not kept).
async function postBundle(bundle, failures) {
  render(loadingCard("Saving your answers..."));
  let result;
  try {
    result = await api("/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bundle) });
  } catch (err) {
    console.error("posting evidence failed:", err);
    showSaveRetry(bundle, failures + 1);
    return;
  }
  state.phase = "idle";
  if (!bundle.engagement.completed) {
    showConstellation(state.student, state.studentHue);
    return;
  }
  const mastered = Array.isArray(result?.newlyMastered) ? result.newlyMastered.filter((m) => m?.concept_id) : [];
  // A concept that both bloomed and cracked a pattern gets the bigger beat
  // only (one line per concept, never two).
  const masteredIds = new Set(mastered.map((m) => m.concept_id));
  const cracked = Array.isArray(result?.patternsCracked) ? result.patternsCracked.filter((p) => p?.concept_id && !masteredIds.has(p.concept_id)) : [];
  if (mastered.length > 0 || cracked.length > 0) {
    showCelebration(mastered, cracked);
    return;
  }
  showEndCard();
}

function showSaveRetry(bundle, failures) {
  render(
    el("div", { class: "screen screen--center" }, [
      el("div", { class: "empty-card" }, [
        el("div", { class: "icon-wrap" }, [fizz("sm")]),
        el("h2", {}, "Oops, that didn't send"),
        el("p", {}, "Let's try that again."),
        el("button", { type: "button", class: "btn-primary", onclick: () => postBundle(bundle, failures) }, "Try again"),
        failures >= 2
          ? el("button", { type: "button", class: "pill-link", onclick: () => { state.phase = "idle"; showConstellation(state.student, state.studentHue); } }, "Back to my stars")
          : null,
      ]),
    ]),
  );
}

// The routine session end: nothing bloomed and no pattern was cracked. Any
// session with a server-reported beat goes to showCelebration() instead.
// No digits anywhere on this card.
function showEndCard() {
  render(
    el("div", { class: "screen screen--center" }, [
      el("div", { class: "end-card" }, [
        el("div", { class: "icon-wrap" }, [fizz("sm")]),
        el("h2", {}, "Thanks for playing!"),
        el("p", {}, "Let's go look at your stars."),
        el("button", { class: "btn-primary", onclick: () => showConstellation(state.student, state.studentHue) }, "See my stars"),
      ]),
    ]),
  );
}

// "Pattern cracked" line (BACKLOG.md E2). Names only the concept, with its
// kid label. The server never sends which misconception it was, and this
// line must never hint at one ("you stopped thinking bigger numbers..."):
// the child just hears they figured out something tricky. Same
// "<lead> — <name>!" shape as the bloom line, so a noun-phrase label reads
// naturally (read aloud: "You figured out a tricky part: Several equal pieces!").
function crackedBeatText(patternsCracked) {
  return patternsCracked.map((p) => {
    const name = CHILD_LABEL[p?.concept_id];
    return name ? `You figured out a tricky part — ${name}!` : "You figured out a tricky part!";
  });
}

// Full-screen celebration (BACKLOG.md E2), shown instead of the end card
// when POST /evidence reports newlyMastered or patternsCracked. Both lists
// are server-side belief/log judgements; this only renders them. Never a
// count ("new stars!" with a number). At most TWO lines: the first bloomed
// concept and the first cracked one. A stack of one line per concept reads
// as a tally ("look how many"); every other star still gets its highlight on
// the map, which is where "more" belongs. Fizz is the one big narrator,
// mid-cheer, inside the teal pulse ring.
function showCelebration(mastered, cracked) {
  const lines = [
    ...masteryBeatText(mastered.slice(0, 1)).map((text) => el("p", { class: "celebrate-line celebrate-line--bloom" }, text)),
    ...crackedBeatText(cracked.slice(0, 1)).map((text) => el("p", { class: "celebrate-line" }, text)),
  ];
  // The map highlights every star that just bloomed (one-shot glow -> bloom)
  // and gently pops a cracked one; Fizz names the first of them.
  const focus = mastered[0]?.concept_id ?? cracked[0]?.concept_id;
  const openMap = () => {
    state.justBloomed = {
      bloomed: mastered.map((m) => m.concept_id),
      cracked: cracked.map((p) => p.concept_id),
      focus,
      focusKind: mastered.length > 0 ? "bloomed" : "cracked",
    };
    showConstellation(state.student, state.studentHue);
  };
  const sparkle = (cls) => el("span", { class: `celebrate-sparkle ${cls}`, "aria-hidden": "true", html: SPARKLE_SVG });
  render(
    el("div", { class: "screen screen--celebrate" }, [
      el("div", { class: "celebrate", role: "status", "aria-live": "polite" }, [
        el("div", { class: "celebrate-fizz" }, [
          sparkle("celebrate-sparkle--a"),
          sparkle("celebrate-sparkle--b"),
          sparkle("celebrate-sparkle--c"),
          fizz("lg", "cheer"),
        ]),
        el("h1", { class: "celebrate-title" }, mastered.length > 0 ? "Your star is shining!" : "Wow, look at you!"),
        el("div", { class: "celebrate-lines" }, lines),
        el("button", { type: "button", class: "btn-primary celebrate-go", onclick: openMap }, [icon("star"), "See your star map"]),
      ]),
    ]),
  );
}

showPicker();
