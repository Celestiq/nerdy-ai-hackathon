const app = document.getElementById("app");
document.getElementById("tutorLink").href = "/tutor/";

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
};

async function api(path, opts) {
  const res = await fetch(`/api${path}`, opts);
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

const TIER_A11Y = { seed: "seed star", glow: "growing star", bloom: "shining star", fading: "star to revisit" };

// The map as home. Everything judgement-shaped (which concepts, which tier,
// which star glows) comes from GET /api/child/map/:studentId -- this
// function never sees a probability and never decides anything. It is also
// the only place a child's session starts from (the Play button).
async function showConstellation(student, hue = 0) {
  state.student = student;
  state.studentHue = hue;
  render(loadingCard());
  const map = await api(`/child/map/${student.student_id}`);
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
        row.push(starNode(conceptById.get(id), starIndex++, onStarTap, slotFor(i)));
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

function starNode(concept, index, onTap, slotClass = "") {
  const tier = concept?.tier ?? "seed";
  // Cascading entrance delay, capped so the whole map twinkles in quickly.
  const delayMs = Math.min(index * 40, 560);
  const cls = `const-star const-star--${tier}${concept?.next ? " const-star--next" : ""} ${slotClass}`.trim();
  const button = el(
    "button",
    {
      type: "button",
      class: cls,
      style: `animation-delay: ${delayMs}ms`,
      "aria-label": `${childLabel(concept?.concept_id)}, ${TIER_A11Y[tier]}`,
    },
    [
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
  state.index = 0;

  const ids = state.assignment.item_specs.map((s) => s.item_id).join(",");
  state.items = await api(`/items/${state.assignment.game_id}?ids=${ids}`);

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
  if (!isHardBlocked) {
    heading = "All done";
    message = "You're all caught up for now. Come back soon!";
    iconName = "hourglass";
  } else if (hasEscalations) {
    heading = "Taking a break from this one";
    message = "Nothing to play right now -- your teacher's got this one. Check back after class!";
    iconName = "pause";
  } else {
    heading = "Nothing lined up right now";
    message = "This isn't the same as being done -- come back in a bit and there should be something new to try.";
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

  const remaining = Math.max(total - index, 0);
  return el("div", { class: "path-wrap" }, [
    el("div", { class: "path-track" }, [...nodes, fizzNode]),
    el("span", { class: "chip chip--neutral" }, remaining > 0 ? `${remaining} to go — not a score` : "That's the set — not a score"),
  ]);
}

function showItem() {
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
      el("div", { class: "topbar" }, [
        el("div", { class: "who" }, [avatar(state.student.name, state.studentHue), state.student.name]),
        el("div", {}),
      ]),
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

  let marker = null;

  function handlePlace(clientX) {
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const localX = (clientX - rect.left) * scaleX;
    const value = Math.max(0, Math.min(1, (localX - margin) / (width - 2 * margin)));

    if (!marker) {
      marker = document.createElementNS(svg.namespaceURI, "circle");
      marker.setAttribute("r", 9);
      marker.setAttribute("cy", trackY);
      marker.setAttribute("class", "line-marker");
      svg.appendChild(marker);
    }
    marker.setAttribute("cx", margin + value * (width - 2 * margin));

    submitAndAdvance({ item_id: item.item_id, value, startedAtMs, endedAtMs: Date.now() });
  }

  svg.addEventListener("click", (e) => handlePlace(e.clientX));

  const lineArea = el("div", { class: "line-area" }, []);
  lineArea.appendChild(svg);

  return [
    el("div", { class: "prompt" }, item.prompt),
    el("div", { class: "subprompt" }, "Tap the line where it belongs"),
    lineArea,
  ];
}

function renderCompare(item, startedAtMs) {
  // data-hue: a fixed blue/magenta pair for side a/b (see .choice-card[data-hue]
  // in index.html) -- purely a stable left/right color convention, not a hint:
  // which side holds the bigger fraction is randomized by the item generator,
  // independent of `side`.
  function card(side) {
    const f = item[side];
    const pct = Math.round((f.numerator / f.denominator) * 100);
    return el(
      "div",
      { class: "choice-card", "data-hue": side === "a" ? "0" : "2", onclick: () => submitAndAdvance({ item_id: item.item_id, choice: side, startedAtMs, endedAtMs: Date.now() }) },
      [
        el("div", { class: "bar-outer" }, [
          el("div", { class: "bar-fill", style: `width:${pct}%` }),
          el("div", { class: "bar-empty", style: `width:${100 - pct}%` }),
        ]),
        el("div", { class: "bar-label" }, `${f.numerator}/${f.denominator}`),
      ],
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
// physics is part of the visual metaphor, not a score/leaderboard readout;
// the child still never sees a correct/incorrect label anywhere (see
// submitAndAdvance's fixed "Nice — next one" note, unchanged by this).
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
  return [el("div", { class: "prompt" }, `Which shows equal ${item.parts === 2 ? "halves" : item.parts === 3 ? "thirds" : "fourths"}?`), el("div", { class: "choice-row" }, [shape("a"), shape("b")])];
}

async function submitAndAdvance(payload) {
  if (state.busy) return; // a tap is already in flight for this item -- ignore extra taps
  state.busy = true;
  try {
    const observation = await api(`/games/${state.assignment.game_id}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, attempts: 1 }),
    });
    state.observations.push(observation);
    state.index += 1;
    render(
      el("div", { class: "screen" }, [
        el("div", { class: "topbar" }, [
          el("div", { class: "who" }, [avatar(state.student.name, state.studentHue), state.student.name]),
          el("div", {}),
        ]),
        el("div", { class: "stage" }, [
          el("div", { class: "feedback-note" }, [el("span", { class: "icon-wrap" }, [icon("check")]), "Nice — next one"]),
        ]),
        pathTrack(state.assignment.item_specs.length, state.index, { justAdvanced: true }),
      ]),
    );
    setTimeout(() => {
      state.busy = false;
      showItem();
    }, 420);
  } catch (err) {
    state.busy = false;
    throw err;
  }
}

// Turns a list of { concept_id, label } into one plain-language beat per
// concept -- never a count ("2 concepts mastered"), never a rate or streak,
// and never a grammatical join of two labels into one sentence (concept
// labels are authored as standalone tutor-facing descriptions -- some are
// short noun phrases, some are full sentences, e.g. F.MAG.UNIT's "A unit
// fraction 1/n is one of n equal parts of a whole" -- joining two of them
// with "and"/comma logic produces a run-on with a mid-sentence capital).
// See BACKLOG.md B2 "Mastery Moment": this only ever reflects a same-session
// transition the server already diffed (newlyMastered on the /evidence
// response), so it's a one-time reward tied to the belief model, not a
// client-side counter or a display of standing status.
// Returns an array of one independently-complete string per concept, e.g.
// ["You've got it — Partition a whole into equal parts!",
//  "You've got it — A unit fraction 1/n is one of n equal parts of a whole!"]
// -- callers render each entry as its own element rather than joining them.
function masteryBeatText(newlyMastered) {
  // Em dash (not a colon) to match the app's existing feedback voice
  // ("Nice — next one") and because concept labels sometimes contain their
  // own colon (e.g. "Fraction notation: numerator and denominator meaning"),
  // which would otherwise read as a jarring double colon.
  return newlyMastered.map((m) => `You've got it — ${m.label}!`);
}

async function finishSession(completed) {
  const bundle = {
    session_id: state.sessionId,
    student_id: state.student.student_id,
    assignment_id: state.assignment.assignment_id,
    game_id: state.assignment.game_id,
    started_at: state.sessionStartedAt,
    ended_at: new Date().toISOString(),
    observations: state.observations,
    engagement: { completed, abandoned_at: completed ? null : new Date().toISOString(), idle_ms: 0 },
  };
  const result = await api("/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bundle) });
  const newlyMastered = Array.isArray(result?.newlyMastered) ? result.newlyMastered : [];

  // A mastery beat gets its own celebratory icon/animation (see
  // .icon-wrap--mastery / pop-in-mastery in index.html) -- one distinct
  // treatment for the whole moment, not per concept, and not driven by any
  // client-side count (newlyMastered.length only ever gates which *branch*
  // renders, it's never displayed). A routine end-of-session (no mastery)
  // keeps the exact same icon-wrap/pop-in/check markup as before this change.
  // Fizz closes out the session too, not just the ones in between -- a
  // routine end gets an idle Fizz in the plain icon-wrap (unchanged
  // circle/pop-in from before), a mastery beat gets Fizz mid-cheer inside
  // the existing icon-wrap--mastery treatment (unchanged pulse ring). The
  // check/star glyphs this replaced were also fine on their own, but this
  // is the moment the report called out explicitly: the character should
  // show up at the edges of a session, not only mid-question.
  const justMastered = newlyMastered.length > 0;
  const endIconWrap = justMastered
    ? el("div", { class: "icon-wrap icon-wrap--mastery" }, [fizz("md", "cheer")])
    : el("div", { class: "icon-wrap" }, [fizz("sm")]);

  render(
    el("div", { class: "screen screen--center" }, [
      el("div", { class: "end-card" }, [
        endIconWrap,
        el("h2", {}, "What you built today"),
        el("p", {}, `You worked through ${state.observations.length} ${state.observations.length === 1 ? "item" : "items"}. That effort counts, whatever the answers were.`),
        ...masteryBeatText(newlyMastered).map((text) => el("p", { class: "mastery-beat" }, text)),
        el("span", { class: "chip chip--neutral" }, "No score, no comparison to anyone else"),
        el("button", { class: "btn-primary", onclick: () => showConstellation(state.student, state.studentHue) }, "See my stars"),
      ]),
    ]),
  );
}

showPicker();
