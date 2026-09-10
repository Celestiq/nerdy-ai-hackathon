const app = document.getElementById("app");
const meta = document.getElementById("meta");
const COHORT_ID = "coh_demo";

const ROSTER_PAGE_SIZE = 4;
const NEEDS_PAGE_SIZE = 5;

// -------------------- tiny DOM + icon helpers --------------------

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
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

// Hand-authored, stroke-based icon set (no external icon font/library) --
// kept to a handful of shapes so the visual language stays consistent.
const ICONS = {
  alert: '<path d="M12 9v4M12 16.5h.01M10.3 4.3 2.7 18a1.5 1.5 0 0 0 1.3 2.2h16a1.5 1.5 0 0 0 1.3-2.2L13.7 4.3a1.5 1.5 0 0 0-2.6 0Z"/>',
  users: '<path d="M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 5 18.5V20M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19 20v-1.5a3 3 0 0 0-2-2.83M16 4.2a3 3 0 0 1 0 5.6"/>',
  trendDown: '<path d="M4 7l6 6 4-4 6 6M20 10.5V15h-4.5"/>',
  grid: '<path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.4.3.6.8.6 1.3v.3h5.8v-.3c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  all: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  doc: '<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h6M9 8.5h2"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
};
function icon(name, cls = "icon") {
  return el("span", { class: cls, html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ""}</svg>` });
}

function initials(name) {
  const parts = name.replace(/\./g, "").trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function avatar(name, hue, size = "md") {
  return el("span", { class: `avatar ${size}`, "data-hue": String(hue % 6) }, initials(name));
}

// Shared loading indicator (see .spinner in shared/styles.css) -- used in
// place of bare "Loading..." text wherever this dashboard is waiting on a
// per-student fetch (test history, session detail).
function loadingRow(label) {
  return el("div", { class: "loading-row" }, [el("span", { class: "spinner" }, [el("span", {}), el("span", {}), el("span", {})]), label]);
}

const STATUS_META = {
  MASTERED: { chip: "chip--mastered", seg: "seg-mastered", solo: "solo-mastered", label: "Mastered" },
  EMERGING: { chip: "chip--emerging", seg: "seg-emerging", solo: "solo-emerging", label: "Emerging" },
  DECAYED: { chip: "chip--decayed", seg: "seg-decayed", solo: "solo-decayed", label: "Decayed" },
  STUCK: { chip: "chip--stuck", seg: "seg-stuck", solo: "solo-stuck", label: "Stuck" },
};

const STRAND_LABEL = { NUMBER: "Whole numbers", GEOMETRY: "Geometry", FRACTION: "Fractions", DECIMAL: "Decimals" };
const STRAND_ORDER = ["NUMBER", "GEOMETRY", "FRACTION", "DECIMAL"];

const GAME_LABEL = { "numberline.place.v2": "Number line placement", "fractionbars.compare.v1": "Fraction bars" };

// -------------------- state --------------------
// Data is fetched once per poll (load) and cached; switching tabs, pages or
// the roster filter only re-renders from the cache -- no network round trip.

let cache = null; // { directory, report, concepts, conceptById, beliefByStudent }
let selectedStudentId = null; // null = whole cohort
let activeTab = "overview"; // "overview" | "history" | "patterns" | "map"
let activeStrand = null;
let rosterPage = 0;
let needsPage = 0;

// Test history: sessions are fetched per-student on demand (not part of the
// initial load()), and question-level detail is fetched per-session, both
// cached so revisiting a tab/expanding again is instant.
const sessionsByStudent = new Map(); // student_id -> summaries[] | "loading"
const sessionDetailById = new Map(); // session_id -> detail | "loading"
let openSessionId = null;

// "Why this next" -- the engine's decision_log (see selectNext() in
// src/engine/engine.ts), fetched live per-student on demand, same caching
// shape as sessionsByStudent above. GET /api/assignment/:studentId is a
// side-effect-free read of current belief state; it does not consume or
// advance the assignment itself, but it does bump the server's in-memory
// sessionCounter (used only to vary assignment_id/seed), same as any other
// dashboard poll would. Collapsed by default -- this is supplementary
// diagnostic detail, not the primary thing a tutor scans.
const assignmentByStudent = new Map(); // student_id -> SelectionOutput | "loading"
let whyOpen = false;

function setTab(tab) {
  activeTab = tab;
  needsPage = 0;
  if (tab === "history") loadSessionsFor(selectedStudentId);
  render();
}
function setStudent(id) {
  selectedStudentId = selectedStudentId === id ? null : id;
  needsPage = 0;
  openSessionId = null;
  whyOpen = false;
  if (activeTab === "history") loadSessionsFor(selectedStudentId);
  if (selectedStudentId) loadAssignmentFor(selectedStudentId);
  render();
}
function setStrand(strand) {
  activeStrand = strand;
  render();
}

function loadSessionsFor(studentId) {
  if (!studentId || sessionsByStudent.has(studentId)) return;
  sessionsByStudent.set(studentId, "loading");
  api(`/sessions/${studentId}`).then((sessions) => {
    sessionsByStudent.set(studentId, sessions);
    render();
  });
}

// force=true bypasses the cache (used by the panel's manual refresh, since
// the underlying belief state can move between when a tutor opens the
// panel and when they check it again).
function loadAssignmentFor(studentId, force = false) {
  if (!studentId) return;
  if (!force && assignmentByStudent.has(studentId)) return;
  assignmentByStudent.set(studentId, "loading");
  api(`/assignment/${studentId}`).then((result) => {
    assignmentByStudent.set(studentId, result);
    render();
  });
}

function toggleSession(studentId, sessionId) {
  openSessionId = openSessionId === sessionId ? null : sessionId;
  if (openSessionId && !sessionDetailById.has(sessionId)) {
    sessionDetailById.set(sessionId, "loading");
    api(`/sessions/${studentId}/${sessionId}`).then((detail) => {
      sessionDetailById.set(sessionId, detail);
      render();
    });
  }
  render();
}

// -------------------- data load --------------------

async function api(path) {
  const res = await fetch(`/api${path}`);
  return res.json();
}

async function load() {
  const [directory, report, concepts] = await Promise.all([
    api("/directory"),
    api(`/tutor/report/${COHORT_ID}`),
    api("/graph/concepts"),
  ]);
  const beliefEntries = await Promise.all(
    directory.map(async (d) => [d.student_id, await api(`/belief/${d.student_id}`)]),
  );
  cache = {
    directory,
    report,
    concepts,
    conceptById: Object.fromEntries(concepts.map((c) => [c.concept_id, c])),
    beliefByStudent: new Map(beliefEntries),
  };
  if (!activeStrand) {
    activeStrand = STRAND_ORDER.find((s) => concepts.some((c) => c.strand === s)) ?? concepts[0]?.strand ?? null;
  }
  render();
}

// -------------------- render root --------------------

function render() {
  if (!cache) return;
  const { report } = cache;
  meta.textContent = `${report.cohort_size} children · generated ${new Date(report.generated_at).toLocaleString()}`;

  app.innerHTML = "";
  app.appendChild(rosterBlock());
  app.appendChild(tabBar());
  const panel = el("div", { class: "tab-panel" });
  if (activeTab === "overview") {
    panel.appendChild(needsHumanBlock());
    if (report.opening_move) panel.appendChild(openingMoveBlock());
    if (selectedStudentId) panel.appendChild(whyNextBlock());
  } else if (activeTab === "history") {
    panel.appendChild(historyBlock());
  } else if (activeTab === "patterns") {
    panel.appendChild(el("div", { class: "grid-2" }, [clustersBlock(), retentionBlock()]));
  } else {
    panel.appendChild(conceptMapBlock());
  }
  app.appendChild(panel);
}

// -------------------- roster (paginated, no horizontal scroll) --------------------

function rosterBlock() {
  const { directory, beliefByStudent, concepts } = cache;
  const totalPages = Math.max(1, Math.ceil(directory.length / ROSTER_PAGE_SIZE));
  rosterPage = Math.min(rosterPage, totalPages - 1);
  const pageItems = directory.slice(rosterPage * ROSTER_PAGE_SIZE, rosterPage * ROSTER_PAGE_SIZE + ROSTER_PAGE_SIZE);

  const wrap = el("div", { class: "tv-section" });
  const row = el("div", { class: "roster-row" });

  row.appendChild(
    el(
      "button",
      { class: "roster-arrow", disabled: rosterPage === 0 ? "true" : null, onclick: () => { rosterPage -= 1; render(); } },
      [icon("chevronLeft")],
    ),
  );

  const cards = el("div", { class: "roster" });
  cards.appendChild(
    el(
      "div",
      { class: "roster-card all-card" + (selectedStudentId === null ? " active" : ""), onclick: () => setStudent(null) },
      [icon("all"), "All children"],
    ),
  );
  pageItems.forEach((d) => {
    const globalIndex = directory.indexOf(d);
    const belief = beliefByStudent.get(d.student_id) ?? [];
    const summary = rosterSummary(belief, concepts.length);
    const stuckN = summary.STUCK;
    cards.appendChild(
      el(
        "div",
        { class: "roster-card" + (selectedStudentId === d.student_id ? " active" : ""), onclick: () => setStudent(d.student_id) },
        [
          el("div", { class: "rc-top" }, [
            avatar(d.name, globalIndex),
            el("div", { class: "rc-name" }, d.name),
            stuckN > 0 ? el("span", { class: "chip chip--stuck rc-flag" }, String(stuckN)) : null,
          ]),
          miniStackMeter(summary, concepts.length),
          el("div", { class: "rc-count" }, `${belief.length}/${concepts.length} measured`),
        ],
      ),
    );
  });
  row.appendChild(cards);

  row.appendChild(
    el(
      "button",
      { class: "roster-arrow", disabled: rosterPage >= totalPages - 1 ? "true" : null, onclick: () => { rosterPage += 1; render(); } },
      [icon("chevronRight")],
    ),
  );

  wrap.appendChild(row);
  if (totalPages > 1) {
    wrap.appendChild(el("div", { class: "roster-page-note" }, `${rosterPage + 1} / ${totalPages}`));
  }
  return wrap;
}

function rosterSummary(belief, totalConcepts) {
  const counts = { MASTERED: 0, EMERGING: 0, DECAYED: 0, STUCK: 0 };
  for (const b of belief) if (counts[b.status] !== undefined) counts[b.status] += 1;
  const unmeasured = Math.max(0, totalConcepts - belief.length);
  return { ...counts, unmeasured };
}

function miniStackMeter(counts, total) {
  const meter = el("div", { class: "stack-meter" });
  for (const key of ["MASTERED", "EMERGING", "DECAYED", "STUCK"]) {
    const n = counts[key];
    if (n <= 0) continue;
    meter.appendChild(el("span", { class: STATUS_META[key].seg, style: `width:${(n / total) * 100}%` }));
  }
  return meter;
}

// -------------------- primary tabs --------------------

function tabBar() {
  const { report } = cache;
  const stuckCount = filteredStuck().length;
  const patternsCount = filteredClusters().length + filteredRetention().length;
  const sessions = selectedStudentId ? sessionsByStudent.get(selectedStudentId) : null;
  const historyCount = Array.isArray(sessions) ? sessions.length : null;

  const tabs = [
    { id: "overview", label: "Overview", icon: "alert", count: stuckCount },
    { id: "history", label: "Test history", icon: "doc", count: historyCount },
    { id: "patterns", label: "Patterns", icon: "users", count: patternsCount },
    { id: "map", label: "Concept map", icon: "grid", count: null },
  ];
  return el(
    "div",
    { class: "tabbar" },
    tabs.map((t) =>
      el(
        "button",
        { class: "tab-btn" + (activeTab === t.id ? " active" : ""), onclick: () => setTab(t.id) },
        [icon(t.icon), t.label, t.count != null && t.count > 0 ? el("span", { class: "badge amber" }, String(t.count)) : null],
      ),
    ),
  );
}

// -------------------- filters (student-scoped views) --------------------

function filteredStuck() {
  const { report } = cache;
  return selectedStudentId ? report.stuck.filter((s) => s.student_id === selectedStudentId) : report.stuck;
}
function filteredClusters() {
  const { report } = cache;
  return selectedStudentId ? report.clusters.filter((c) => c.student_ids.includes(selectedStudentId)) : report.clusters;
}
function filteredRetention() {
  const { report } = cache;
  return selectedStudentId ? report.retention.filter((r) => r.student_id === selectedStudentId) : report.retention;
}

// -------------------- overview: needs a human (paginated) --------------------

function needsHumanBlock() {
  const { directory } = cache;
  const stuck = filteredStuck();
  const hueOf = new Map(directory.map((d, i) => [d.student_id, i]));

  const block = el("div", { class: "card card-pad tv-section" }, [
    el("div", { class: "sec-h" }, [
      el("span", { class: "icon-wrap amber" }, [icon("alert")]),
      el("span", { class: "sec-title" }, "Needs a human"),
      el("span", { class: "badge amber" }, String(stuck.length)),
    ]),
  ]);
  if (stuck.length === 0) {
    block.appendChild(el("div", { class: "empty" }, "No one is stuck right now."));
    return block;
  }

  const byStudent = new Map();
  for (const s of stuck) {
    if (!byStudent.has(s.student_id)) byStudent.set(s.student_id, { name: s.name, items: [] });
    byStudent.get(s.student_id).items.push(s);
  }
  const entries = [...byStudent];
  const totalPages = Math.max(1, Math.ceil(entries.length / NEEDS_PAGE_SIZE));
  needsPage = Math.min(needsPage, totalPages - 1);
  const pageEntries = entries.slice(needsPage * NEEDS_PAGE_SIZE, needsPage * NEEDS_PAGE_SIZE + NEEDS_PAGE_SIZE);

  for (const [studentId, group] of pageEntries) {
    block.appendChild(
      el("div", { class: "na-row" }, [
        avatar(group.name, hueOf.get(studentId) ?? 0),
        el("div", { class: "na-body" }, [
          el("div", { class: "na-name" }, group.name),
          el(
            "div",
            { class: "na-chips" },
            group.items.map((s) =>
              el("span", { class: "chip chip--stuck" }, [
                el("span", { class: "dot" }),
                `${s.concept_id} · ${s.attempts_without_mastery} sessions`,
              ]),
            ),
          ),
        ]),
      ]),
    );
  }

  if (totalPages > 1) {
    block.appendChild(
      el("div", { class: "pager" }, [
        el("button", { disabled: needsPage === 0 ? "true" : null, onclick: () => { needsPage -= 1; render(); } }, [icon("chevronLeft")]),
        el("span", { class: "pager-note" }, `${needsPage + 1} / ${totalPages}`),
        el("button", { disabled: needsPage >= totalPages - 1 ? "true" : null, onclick: () => { needsPage += 1; render(); } }, [icon("chevronRight")]),
      ]),
    );
  }
  return block;
}

// -------------------- overview: opening move --------------------

function openingMoveBlock() {
  const { report } = cache;
  return el("div", { class: "card spotlight tv-section" }, [
    el("span", { class: "icon-wrap" }, [icon("bulb")]),
    el("div", { class: "body" }, [
      el("h2", {}, "Suggested opening — 5 min"),
      el("p", {}, report.opening_move.text),
    ]),
  ]);
}

// -------------------- overview: "why this next" (glass-box routing trace) --------------------
// Renders selectNext()'s decision_log (src/engine/engine.ts) -- the
// auditable, per-concept record of every candidate the engine considered
// for this student's *next* assignment, and why it was included or
// excluded. Teacher-facing only: a K-5 child never sees scores or routing
// internals (see CLAUDE.md/SWARM.md's no-score rule), which is why this
// lives in public/tutor and has no counterpart in public/child.

// Lightly cleans up the engine's own reason strings for a non-engineer
// reader without inventing new reasons or changing what they mean -- the
// exact original string is always shown underneath as well, so nothing the
// engine actually said is hidden.
function humanizeReason(reason) {
  if (reason.includes("wheel-spin relaxed")) {
    return "Re-served anyway: every other option was blocked this round, so this concept's \"stuck\" block was relaxed rather than leaving the child with nothing to do.";
  }
  const wheelBlock = reason.match(/^wheel-spin block: attempts_without_mastery=(\d+) >= (\d+)/);
  if (wheelBlock) {
    return `Blocked: ${wheelBlock[1]} sessions in a row without mastering this (wheel-spin guard, limit ${wheelBlock[2]}) -- flagged as "needs a human" instead of kept in rotation.`;
  }
  const prereq = reason.match(/^prerequisite gate: unmet hard prerequisite\(s\) (.+)/);
  if (prereq) return `Blocked: prerequisite concept(s) not yet mastered -- ${prereq[1]}.`;
  const variety = reason.match(/^variety: outside top (\d+) concepts/);
  if (variety) return `Not chosen this round: kept out to keep the session focused on the top ${variety[1]} concepts.`;
  if (reason === "selected: top of frontier/uncertainty/retrieval/blame score") {
    return "Selected: currently the highest-priority concept (combines how ready/central it is, how uncertain we are, retrieval timing, and misconception evidence).";
  }
  if (reason === "cold start: root concept, first session") return "Selected: first-ever session, so we start at a foundational concept.";
  if (reason === "matched game did not cover this concept") return "Not chosen: the game selected for this session doesn't cover this concept.";
  if (reason === "excluded by hard constraints") return "Blocked by a hard constraint.";
  if (reason.startsWith("no registered game covers this concept")) return "Not chosen: no registered game currently assesses this concept.";
  return reason;
}

function decisionRow(entry, conceptById) {
  const label = conceptById[entry.concept_id]?.label ?? entry.concept_id;
  const isRelaxed = entry.reason.includes("wheel-spin relaxed");
  const isWheelBlock = entry.reason.includes("wheel-spin block");
  const classes = ["decision-row", entry.included ? "decision-row--included" : "decision-row--excluded"];
  if (isRelaxed) classes.push("decision-row--relaxed");
  else if (isWheelBlock) classes.push("decision-row--wheelblock");

  return el("div", { class: classes.join(" ") }, [
    el("div", { class: "decision-top" }, [
      el("div", { class: "decision-left" }, [
        el("span", { class: "mono-chip" }, label),
        isRelaxed ? el("span", { class: "chip chip--stuck" }, [icon("alert", "icon icon-sm"), "re-served (relaxed)"]) : null,
        isWheelBlock && !isRelaxed ? el("span", { class: "chip chip--stuck" }, [icon("alert", "icon icon-sm"), "wheel-spin block"]) : null,
      ]),
      el("div", { class: "decision-right" }, [
        el("span", { class: "decision-score" }, `score ${entry.score.toFixed(2)}`),
        el("span", { class: "chip " + (entry.included ? "chip--mastered" : "chip--neutral") }, [
          icon(entry.included ? "check" : "cross", "icon icon-sm"),
          entry.included ? "Included" : "Excluded",
        ]),
      ]),
    ]),
    el("div", { class: "decision-reason" }, humanizeReason(entry.reason)),
    el("div", { class: "decision-reason-raw" }, entry.reason),
  ]);
}

function whyNextBlock() {
  const { directory, conceptById } = cache;
  const student = directory.find((d) => d.student_id === selectedStudentId);
  const data = assignmentByStudent.get(selectedStudentId);

  const header = el(
    "button",
    { class: "why-toggle", onclick: () => { whyOpen = !whyOpen; render(); } },
    [
      el("span", { class: "why-chevron" + (whyOpen ? " open" : "") }, [icon("chevronDown")]),
      el("span", { class: "icon-wrap gray" }, [icon("bulb")]),
      el("span", { class: "sec-title" }, `Why this next${student ? ` — ${student.name}` : ""}`),
      el("span", { class: "why-hint" }, "routing trace"),
    ],
  );
  const block = el("div", { class: "card card-pad tv-section why-block" }, [header]);
  if (!whyOpen) return block;

  if (data === "loading" || data === undefined) {
    block.appendChild(loadingRow("Computing the engine's next decision..."));
    return block;
  }

  const body = el("div", { class: "why-body" });

  const refreshRow = el("div", { class: "why-refresh-row" }, [
    el("span", { class: "why-note" }, "A live, read-only snapshot of the routing engine's current decision for this child -- not a record of what was actually assigned."),
    el("button", { class: "pill-link why-refresh", onclick: () => { loadAssignmentFor(selectedStudentId, true); render(); } }, "refresh"),
  ]);
  body.appendChild(refreshRow);

  if (data.assignment) {
    body.appendChild(el("div", { class: "why-note" }, `Next up: ${GAME_LABEL[data.assignment.game_id] ?? data.assignment.game_id}`));
  } else if (data.reason) {
    body.appendChild(el("div", { class: "why-note why-note-warn" }, `No assignment produced this round: ${data.reason}`));
  }

  const log = data.decisionLog ?? [];
  if (log.length === 0) {
    body.appendChild(el("div", { class: "empty" }, "No routing decision available right now."));
  } else {
    const included = log.filter((d) => d.included).sort((a, b) => b.score - a.score);
    const excluded = log.filter((d) => !d.included).sort((a, b) => b.score - a.score);
    if (included.length > 0) {
      body.appendChild(el("div", { class: "why-group-label" }, "Included — what the child gets next"));
      for (const d of included) body.appendChild(decisionRow(d, conceptById));
    }
    if (excluded.length > 0) {
      body.appendChild(el("div", { class: "why-group-label" }, "Considered, not chosen"));
      for (const d of excluded) body.appendChild(decisionRow(d, conceptById));
    }
  }

  if (data.escalations && data.escalations.length > 0) {
    body.appendChild(
      el("div", { class: "why-note" }, [
        "Currently flagged \"needs a human\": ",
        data.escalations.map((cid) => conceptById[cid]?.label ?? cid).join(", "),
      ]),
    );
  }

  block.appendChild(body);
  return block;
}

// -------------------- test history: every past test, drill into questions --------------------

function historyBlock() {
  const { directory } = cache;
  const block = el("div", { class: "card card-pad tv-section" }, [
    el("div", { class: "sec-h" }, [
      el("span", { class: "icon-wrap gray" }, [icon("doc")]),
      el("span", { class: "sec-title" }, "Test history"),
    ]),
  ]);

  if (!selectedStudentId) {
    block.appendChild(el("div", { class: "empty" }, "Pick a child from the roster above to see their past tests."));
    return block;
  }

  const student = directory.find((d) => d.student_id === selectedStudentId);
  const sessions = sessionsByStudent.get(selectedStudentId);

  if (sessions === "loading" || sessions === undefined) {
    block.appendChild(loadingRow(`Loading ${student.name}'s tests...`));
    return block;
  }
  if (sessions.length === 0) {
    block.appendChild(el("div", { class: "empty" }, `${student.name} hasn't taken any tests yet.`));
    return block;
  }

  const list = el("div", { class: "history-list" });
  for (const s of sessions) list.appendChild(sessionRow(student, s));
  block.appendChild(list);
  return block;
}

function sessionRow(student, summary) {
  const { conceptById } = cache;
  const isOpen = openSessionId === summary.session_id;
  const when = new Date(summary.started_at);
  const pct = summary.item_count > 0 ? Math.round((summary.correct_count / summary.item_count) * 100) : 0;

  const header = el(
    "button",
    { class: "session-head" + (isOpen ? " open" : ""), onclick: () => toggleSession(student.student_id, summary.session_id) },
    [
      el("span", { class: "session-chevron" + (isOpen ? " open" : "") }, [icon("chevronDown")]),
      el("div", { class: "session-title" }, [
        el("span", { class: "session-game" }, GAME_LABEL[summary.game_id] ?? summary.game_id),
        el("span", { class: "session-date" }, when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })),
      ]),
      el(
        "div",
        { class: "session-concepts" },
        summary.concept_ids.map((cid) => el("span", { class: "mono-chip" }, conceptById[cid]?.label ?? cid)),
      ),
      !summary.completed ? el("span", { class: "chip chip--stuck" }, "abandoned") : null,
      el("span", { class: "chip " + (pct >= 80 ? "chip--mastered" : pct >= 50 ? "chip--emerging" : "chip--weak") }, `${summary.correct_count}/${summary.item_count} correct`),
    ],
  );

  const wrap = el("div", { class: "session-row" }, [header]);
  if (isOpen) wrap.appendChild(sessionDetailPanel(student, summary));
  return wrap;
}

function sessionDetailPanel(student, summary) {
  const { conceptById } = cache;
  const detail = sessionDetailById.get(summary.session_id);
  const panel = el("div", { class: "session-detail" });

  if (detail === "loading" || detail === undefined) {
    panel.appendChild(loadingRow("Loading questions..."));
    return panel;
  }

  detail.observations.forEach((o, i) => {
    const correct = o.verdict === "correct";
    panel.appendChild(
      el("div", { class: "question-row" }, [
        el("div", { class: "q-num" }, `Q${i + 1}`),
        el("div", { class: "q-body" }, [
          el("div", { class: "q-top" }, [
            el("span", { class: "mono-chip" }, conceptById[o.concept_id]?.label ?? o.concept_label),
            el("span", { class: "chip " + (correct ? "chip--mastered" : "chip--weak") }, [
              icon(correct ? "check" : "cross", "icon icon-sm"),
              correct ? "Correct" : "Incorrect",
            ]),
          ]),
          el("div", { class: "q-prompt" }, o.prompt_label),
          el("div", { class: "q-answers" }, [
            el("span", { class: "q-answer" }, [el("span", { class: "q-answer-label" }, "Answered: "), o.student_answer_label]),
            !correct ? el("span", { class: "q-answer" }, [el("span", { class: "q-answer-label" }, "Correct answer: "), o.correct_answer_label]) : null,
          ]),
          !correct
            ? el("div", { class: "q-insight" }, [
                el("span", { class: "insight-icon" }, [icon("bulb")]),
                el("div", {}, [
                  el("div", { class: "q-insight-text" }, o.signature_meaning ?? "No specific misconception pattern detected in this response."),
                  o.blamed_concepts.length > 0
                    ? el("div", { class: "cluster-chain q-blame" }, [
                        el("span", {}, "may trace back to"),
                        ...o.blamed_concepts.map((b) => el("span", { class: "node root" }, b.label)),
                      ])
                    : null,
                ]),
              ])
            : null,
        ]),
      ]),
    );
  });

  return panel;
}

// -------------------- patterns: shared misconceptions --------------------

function clustersBlock() {
  const { conceptById } = cache;
  const clusters = filteredClusters();
  const block = el("div", { class: "card card-pad" }, [
    el("div", { class: "sec-h" }, [
      el("span", { class: "icon-wrap magenta" }, [icon("users")]),
      el("span", { class: "sec-title" }, "Shared misconceptions"),
      el("span", { class: "badge" }, String(clusters.length)),
    ]),
  ]);
  if (clusters.length === 0) {
    block.appendChild(el("div", { class: "empty" }, "Not enough data yet — nothing to report."));
    return block;
  }
  for (const c of clusters) {
    const label = conceptById[c.concept_id]?.label ?? c.concept_id;
    const rootLabel = c.root_cause ? conceptById[c.root_cause]?.label ?? c.root_cause : null;
    block.appendChild(
      el("div", { class: "cluster-row" }, [
        el(
          "div",
          { class: "cluster-names" },
          c.names.map((n) => el("span", { class: "chip chip--weak" }, n)),
        ),
        el("div", { class: "cluster-chain" }, [
          el("span", { class: "node" }, label),
          el("span", {}, c.signature.toLowerCase().replace(/_/g, " ")),
          rootLabel
            ? el("div", { class: "cluster-chain" }, [icon("arrow", "icon arrow"), el("span", { class: "node root" }, rootLabel)])
            : null,
        ]),
      ]),
    );
  }
  return block;
}

// -------------------- patterns: lost since earlier --------------------

function retentionBlock() {
  const { conceptById } = cache;
  const retention = filteredRetention();
  const block = el("div", { class: "card card-pad" }, [
    el("div", { class: "sec-h" }, [
      el("span", { class: "icon-wrap purple" }, [icon("trendDown")]),
      el("span", { class: "sec-title" }, "Lost since earlier"),
      el("span", { class: "badge" }, String(retention.length)),
    ]),
  ]);
  if (retention.length === 0) {
    block.appendChild(el("div", { class: "empty" }, "Nothing decayed yet."));
    return block;
  }
  for (const r of retention) {
    const label = conceptById[r.concept_id]?.label ?? r.concept_id;
    const rmeter = el("div", { class: "range-meter" }, [
      el("span", { class: "fill", style: `width:${Math.round(r.p_decayed * 100)}%` }),
      el("span", { class: "marker", style: `left:${Math.round(r.p_mastery * 100)}%` }),
    ]);
    block.appendChild(
      el("div", { class: "ret-row" }, [
        el("div", { class: "ret-head" }, [
          el("span", {}, [el("span", { class: "name" }, r.name), " — ", el("span", { class: "concept" }, label)]),
          el("span", { class: "ret-val" }, `p(decayed) ${r.p_decayed.toFixed(2)}`),
        ]),
        rmeter,
      ]),
    );
  }
  return block;
}

// -------------------- concept map (tabbed by strand, no stacked scroll) --------------------

function conceptMapBlock() {
  const { report, concepts, beliefByStudent } = cache;
  const coverageById = Object.fromEntries(report.coverage.map((r) => [r.concept_id, r]));
  const soloBelief = selectedStudentId ? new Map((beliefByStudent.get(selectedStudentId) ?? []).map((b) => [b.concept_id, b])) : null;

  const strandsPresent = STRAND_ORDER.filter((s) => concepts.some((c) => c.strand === s));
  for (const c of concepts) if (!strandsPresent.includes(c.strand)) strandsPresent.push(c.strand);
  if (!activeStrand || !strandsPresent.includes(activeStrand)) activeStrand = strandsPresent[0];

  const block = el("div", { class: "card card-pad tv-section" }, [
    el("div", { class: "sec-h" }, [
      el("span", { class: "icon-wrap gray" }, [icon("grid")]),
      el("span", { class: "sec-title" }, selectedStudentId ? "Concept map — this child" : "Concept map — whole cohort"),
    ]),
    el(
      "div",
      { class: "subtabbar" },
      strandsPresent.map((s) =>
        el("button", { class: "subtab-btn" + (activeStrand === s ? " active" : ""), onclick: () => setStrand(s) }, STRAND_LABEL[s] ?? s),
      ),
    ),
  ]);

  const grid = el("div", { class: "concept-grid" });
  for (const node of concepts.filter((c) => c.strand === activeStrand)) {
    grid.appendChild(conceptTile(node, coverageById[node.concept_id], soloBelief, report.cohort_size));
  }
  block.appendChild(grid);
  block.appendChild(legend());
  return block;
}

function conceptTile(node, coverage, soloBelief, cohortSize) {
  if (soloBelief) {
    const b = soloBelief.get(node.concept_id);
    if (!b) {
      return el("div", { class: "concept-tile unmeasured" }, [
        el("span", { class: "cid" }, node.concept_id),
        el("div", { class: "clabel" }, node.label),
        el("div", { class: "cfoot" }, [el("span", { class: "n" }, "unmeasured")]),
      ]);
    }
    const m = STATUS_META[b.status] ?? STATUS_META.EMERGING;
    return el("div", { class: `concept-tile ${m.solo}` }, [
      el("span", { class: "cid" }, node.concept_id),
      el("div", { class: "clabel" }, node.label),
      el("div", { class: "cfoot" }, [el("span", { class: "n" }, m.label), el("span", { class: "n" }, `p=${b.p_mastery.toFixed(2)}`)]),
    ]);
  }

  if (!coverage || coverage.measured_n === 0) {
    return el("div", { class: "concept-tile unmeasured" }, [
      el("span", { class: "cid" }, node.concept_id),
      el("div", { class: "clabel" }, node.label),
      el("div", { class: "cfoot" }, [el("span", { class: "n" }, "unmeasured")]),
    ]);
  }
  const other = Math.max(0, cohortSize - coverage.mastered_n - coverage.weak_n);
  const meter = el("div", { class: "stack-meter" }, [
    coverage.mastered_n > 0 ? el("span", { class: "seg-mastered", style: `width:${(coverage.mastered_n / cohortSize) * 100}%` }) : null,
    coverage.weak_n > 0 ? el("span", { class: "seg-weak", style: `width:${(coverage.weak_n / cohortSize) * 100}%` }) : null,
    other > 0 ? el("span", { style: `width:${(other / cohortSize) * 100}%;background:var(--rule-lite)` }) : null,
  ]);
  return el("div", { class: "concept-tile" }, [
    el("span", { class: "cid" }, node.concept_id),
    el("div", { class: "clabel" }, node.label),
    meter,
    el("div", { class: "cfoot" }, [
      el("span", { class: "n" }, `${coverage.mastered_n} mastered`),
      coverage.weak_n > 0 ? el("span", { class: "n" }, `${coverage.weak_n} weak`) : null,
    ]),
  ]);
}

function legend() {
  const items = [
    ["var(--status-mastered)", "mastered"],
    ["var(--status-emerging)", "emerging"],
    ["var(--status-weak)", "weak (measured, confident)"],
    ["var(--status-stuck)", "stuck"],
    ["var(--status-decayed)", "decayed"],
  ];
  const legendEl = el(
    "div",
    { class: "legend" },
    items.map(([color, label]) => el("span", { class: "item" }, [el("span", { class: "sw", style: `background:${color}` }), label])),
  );
  legendEl.appendChild(
    el("span", { class: "item" }, [
      el("span", { class: "sw", style: "background:transparent;border:1.5px dashed var(--rule)" }),
      "unmeasured — not the same as weak",
    ]),
  );
  return legendEl;
}

load();
setInterval(load, 15000);
