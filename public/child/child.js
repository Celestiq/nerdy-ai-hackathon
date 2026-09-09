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
function icon(name, cls = "icon") {
  return el("span", { class: cls, html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ""}</svg>` });
}
function initials(name) {
  return name.replace(/\./g, "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
function avatar(name, hue, cls = "") {
  return el("span", { class: `avatar ${cls}`, "data-hue": String(hue % 6) }, initials(name));
}

// Plain-English display names for the graph's strand codes -- words only,
// never a count or ranking. Kept local to this file rather than imported
// from tutor.js (a different surface with a different bundling story), but
// intentionally the exact same strings tutor.js's STRAND_LABEL uses so the
// two surfaces read as one vocabulary.
const STRAND_LABEL = { NUMBER: "Whole numbers", GEOMETRY: "Geometry", FRACTION: "Fractions", DECIMAL: "Decimals" };

// -------------------- picker --------------------

async function showPicker() {
  const directory = await api("/directory");
  const rows = directory.map((d, i) =>
    el("div", { class: "picker-row" }, [
      el("button", { class: "picker-play", onclick: () => startSession(d, i) }, [avatar(d.name, i), el("span", {}, d.name)]),
      el(
        "button",
        { class: "picker-map", onclick: () => showConstellation(d, i), "aria-label": `${d.name}'s star map` },
        [icon("star")],
      ),
    ]),
  );
  render(
    el("div", {}, [
      el("div", { class: "picker-head" }, [el("h1", {}, "Who's playing?")]),
      el("div", { class: "picker" }, rows),
    ]),
  );
}

// -------------------- constellation (persistent, cross-session progress) --------------------

// Wordless-by-design (IDEAS.md B1 "Concept Constellation"): a passive view a
// child can visit between sessions, generated fresh from live belief state
// -- not a client-side counter, not a level-select list. Reuses the exact
// two-endpoint join public/tutor/tutor.js's load() already does (lines
// ~132-147): GET /api/graph/concepts (label + strand per concept, already
// grouped contiguously by strand in the graph data -- no separate
// strand-order constant to keep in sync here) joined with
// GET /api/belief/:studentId (only concepts this student has ever been
// observed on -- a concept never attempted simply has no entry, which is
// exactly the "unmeasured must look categorically different from weak"
// distinction the architecture calls for).
//
// Zero numbers, zero ranking, zero cross-child comparison, by construction:
// this function never reads p_mastery/p_decayed/confidence as anything but
// an input to which CSS tier a star renders in (see starNode() below and
// the .const-star--* rules in index.html), and every visible string here is
// hand-authored words with no digits. No tap-to-launch-a-session
// interactivity -- this is a passive view only (see BACKLOG.md).
async function showConstellation(student, hue = 0) {
  render(el("div", { class: "empty-card" }, "Loading..."));
  const [concepts, belief] = await Promise.all([api("/graph/concepts"), api(`/belief/${student.student_id}`)]);
  const beliefByConcept = new Map(belief.map((b) => [b.concept_id, b]));

  const strandOrder = [];
  const conceptsByStrand = new Map();
  for (const c of concepts) {
    if (!conceptsByStrand.has(c.strand)) {
      conceptsByStrand.set(c.strand, []);
      strandOrder.push(c.strand);
    }
    conceptsByStrand.get(c.strand).push(c);
  }

  // A running index across the *whole* map (not reset per strand) so the
  // entrance animation below reads as one continuous cascade down the page
  // -- a bit of load-time "juice" appropriate to a map you're meant to feel
  // good looking at, not a flat instant grid. Purely decorative: it never
  // gates or delays anything the child can act on (there's nothing to tap
  // here -- see BACKLOG.md, this view is passive-only).
  let starIndex = 0;
  const sections = strandOrder.map((strand) =>
    el("div", { class: "const-strand" }, [
      el("h2", { class: "const-strand-title" }, STRAND_LABEL[strand] ?? strand),
      el(
        "div",
        { class: "const-grid" },
        conceptsByStrand.get(strand).map((c) => starNode(beliefByConcept.get(c.concept_id), starIndex++)),
      ),
    ]),
  );

  render(
    el("div", {}, [
      el("div", { class: "topbar" }, [
        el("div", { class: "who" }, [avatar(student.name, hue), student.name]),
        el("button", { class: "pill-link const-back", onclick: showPicker }, "Back"),
      ]),
      el("div", { class: "const-head" }, [
        el("h1", {}, "Your star map"),
        el("p", { class: "const-sub" }, "Stars grow the more comfortable you get -- no scores, just your own path."),
      ]),
      el("div", { class: "const-body" }, sections),
    ]),
  );
}

// Maps a belief entry (or its absence) to one of four visual tiers. Never
// returns or renders p_mastery/p_decayed/confidence itself -- those numbers
// only ever decide *which* tier this returns, per the hard no-numbers
// constraint on this view.
function starTier(belief) {
  if (!belief) return "seed"; // never attempted -- a seed, not a failure
  if (belief.status === "MASTERED") return "bloom";
  if (belief.status === "DECAYED") return "fading"; // was mastered, now fading -- distinct from both seed and glow
  return "glow"; // EMERGING or STUCK share one child-facing tier by design --
  // see index.html: STUCK must not read as alarming/discouraging here, so it
  // gets the same warm "in progress" treatment EMERGING does, not the tutor
  // dashboard's amber "needs attention" color.
}

const STAR_TIER_LABEL = {
  seed: "Not started yet",
  glow: "In progress",
  bloom: "Mastered",
  fading: "Was mastered, fading -- worth a revisit",
};

function starNode(belief, index = 0) {
  const tier = starTier(belief);
  // Cascading entrance delay, capped so a student with many concepts still
  // finishes twinkling in well under a second -- see .const-star's
  // animation in index.html (reuses the house pop-in easing).
  const delayMs = Math.min(index * 28, 480);
  return el(
    "div",
    {
      class: `const-star const-star--${tier}`,
      style: `animation-delay: ${delayMs}ms`,
      role: "img",
      "aria-label": STAR_TIER_LABEL[tier],
    },
    [icon("star")],
  );
}

async function startSession(student, hue = 0) {
  state.student = student;
  state.studentHue = hue;
  render(el("div", { class: "empty-card" }, "Loading..."));
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
    el("div", { class: "empty-card" }, [
      el("div", { class: "icon-wrap" }, [icon(iconName)]),
      el("h2", {}, heading),
      el("p", {}, message),
      el("button", { class: "btn-primary", onclick: showPicker }, "Back"),
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

function progressDots() {
  const total = state.assignment.item_specs.length;
  const segs = [];
  for (let i = 0; i < total; i++) {
    segs.push(el("div", { class: "seg" + (i < state.index ? " done" : "") }));
  }
  return el("div", { class: "progress-wrap" }, [
    el("div", { class: "progress-track" }, segs),
    el("span", { class: "chip chip--neutral" }, `${total - state.index} to go — not a score`),
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
  } else if (item.kind === "partition") {
    stage = renderPartition(item, startedAtMs);
  } else {
    stage = renderCompare(item, startedAtMs);
  }

  render(
    el("div", {}, [
      el("div", { class: "topbar" }, [
        el("div", { class: "who" }, [avatar(state.student.name, state.studentHue), state.student.name]),
        el("div", {}),
      ]),
      el("div", { class: "stage" }, stage),
      progressDots(),
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
  function card(side) {
    const f = item[side];
    const pct = Math.round((f.numerator / f.denominator) * 100);
    return el(
      "div",
      { class: "choice-card", onclick: () => submitAndAdvance({ item_id: item.item_id, choice: side, startedAtMs, endedAtMs: Date.now() }) },
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

function renderPartition(item, startedAtMs) {
  function shape(side) {
    const equal = side === item.correct;
    const slices = [];
    for (let i = 0; i < item.parts; i++) {
      const uneven = !equal && i === 0;
      slices.push(el("div", { class: "partition-slice" + (i % 2 === 0 ? " fill" : ""), style: uneven ? "flex:2" : "" }));
    }
    return el(
      "div",
      { class: "choice-card", onclick: () => submitAndAdvance({ item_id: item.item_id, choice: side, startedAtMs, endedAtMs: Date.now() }) },
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
      el("div", { class: "stage" }, [
        el("div", { class: "feedback-note" }, [el("span", { class: "icon-wrap" }, [icon("check")]), "Nice — next one"]),
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
  const justMastered = newlyMastered.length > 0;
  const endIconWrap = justMastered
    ? el("div", { class: "icon-wrap icon-wrap--mastery" }, [icon("star")])
    : el("div", { class: "icon-wrap" }, [icon("check")]);

  render(
    el("div", { class: "end-card" }, [
      endIconWrap,
      el("h2", {}, "What you built today"),
      el("p", {}, `You worked through ${state.observations.length} ${state.observations.length === 1 ? "item" : "items"}. That effort counts, whatever the answers were.`),
      ...masteryBeatText(newlyMastered).map((text) => el("p", { class: "mastery-beat" }, text)),
      el("span", { class: "chip chip--neutral" }, "No score, no comparison to anyone else"),
      el("button", { class: "btn-primary", onclick: showPicker }, "Done"),
    ]),
  );
}

showPicker();
