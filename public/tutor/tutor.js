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

// Icon set sourced from Lucide (ISC-licensed, lucide.dev) -- path data
// copied in verbatim rather than pulled from a CDN, so the dashboard has
// zero runtime icon dependency (matters for an offline demo) while still
// getting a proper, consistent, professionally-drawn icon pack instead of
// ad hoc hand-rolled shapes.
const ICONS = {
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  support: '<path d="M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"/><path d="m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95"/><path d="m2 15 6 6"/><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  trendDown: '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  all: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  doc: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  cross: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
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
const STRAND_ORDER = ["NUMBER", "OPERATIONS", "ALGEBRA", "GEOMETRY", "MEASUREMENT", "DATA", "FRACTION", "DECIMAL"];

const GAME_LABEL = {
  "numberline.place.v2": "Number line placement",
  "fractionbars.compare.v1": "Fraction bars",
  "balancescale.compare.v1": "Balance scale",
};

// -------------------- state --------------------
// Data is fetched once per poll (load) and cached; switching tabs, pages or
// the roster filter only re-renders from the cache -- no network round trip.

let cache = null; // { directory, report, concepts, conceptById, beliefByStudent }
// Fingerprint of the last poll's substantive data (see load() below) -- lets
// the 15s poll skip a full render() when nothing actually changed, instead
// of tearing down and rebuilding the whole DOM (and replaying every
// entrance animation) every 15 seconds regardless.
let lastSnapshotKey = null;
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
// First-contact discoverability: a tutor landing cold on /tutor/ has no way
// to know this panel exists (it's collapsed and only rendered once a child
// is selected). Auto-expand it the very first time any student is picked
// this browser session, then go back to collapsed-by-default (the original
// design intent) for every subsequent switch -- same one-shot-per-session
// shape as e.g. sessionsByStudent's per-student cache, just for a UI flag
// instead of fetched data.
let hasAutoOpenedWhy = false;

function setTab(tab) {
  activeTab = tab;
  needsPage = 0;
  if (tab === "history") loadSessionsFor(selectedStudentId);
  // Only the tab bar (active underline) and the panel content change --
  // the sidebar stats and roster strip don't depend on which tab is open.
  renderTabBar();
  renderPanel();
}
function setStudent(id) {
  selectedStudentId = selectedStudentId === id ? null : id;
  needsPage = 0;
  openSessionId = null;
  if (selectedStudentId && !hasAutoOpenedWhy) {
    whyOpen = true;
    hasAutoOpenedWhy = true;
  } else {
    whyOpen = false;
  }
  if (activeTab === "history") loadSessionsFor(selectedStudentId);
  if (selectedStudentId) loadAssignmentFor(selectedStudentId);
  // A different student genuinely changes all four regions: the sidebar
  // stats scope to them, tab-bar badge counts are filtered by student,
  // panel content is filtered, and the roster's "active" highlight moves.
  renderPulse();
  renderTabBar();
  renderPanel();
  renderRoster();
}
function setStrand(strand) {
  activeStrand = strand;
  renderPanel();
}

function loadSessionsFor(studentId) {
  if (!studentId || sessionsByStudent.has(studentId)) return;
  sessionsByStudent.set(studentId, "loading");
  api(`/sessions/${studentId}`).then((sessions) => {
    sessionsByStudent.set(studentId, sessions);
    // The Test history tab's badge count depends on this too.
    renderTabBar();
    renderPanel();
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
    renderPanel();
  });
}

function toggleSession(studentId, sessionId) {
  openSessionId = openSessionId === sessionId ? null : sessionId;
  if (openSessionId && !sessionDetailById.has(sessionId)) {
    sessionDetailById.set(sessionId, "loading");
    api(`/sessions/${studentId}/${sessionId}`).then((detail) => {
      sessionDetailById.set(sessionId, detail);
      renderPanel();
    });
  }
  renderPanel();
}

// -------------------- data load --------------------

async function api(path) {
  const res = await fetch(`/api${path}`);
  return res.json();
}

// Recursively rounds every number in a JSON-shaped value to 3 decimal
// places. Used only to build the poll-comparison fingerprint below --
// nothing displayed ever shows more precision than 2 decimals, so this
// throws away sub-visible noise (see load()'s comment) without risking
// masking a real change.
function roundFloats(value) {
  if (typeof value === "number") return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(roundFloats);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = roundFloats(v);
    return out;
  }
  return value;
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

  // report.generated_at is a fresh timestamp on every single poll (the
  // server stamps it at request time), and belief probabilities drift by
  // sub-thousandth floating-point amounts between requests seconds apart
  // (the engine's decay math is a function of elapsed wall-clock time, so
  // it never sits perfectly still) -- neither is visible to a tutor, so
  // both are normalized away here before comparing. Otherwise every 15s
  // poll would look "changed" and force a full rebuild no matter what.
  const { generated_at, ...reportRest } = report;
  const snapshotKey = JSON.stringify(roundFloats({ directory, reportRest, concepts, beliefEntries }));
  const changed = snapshotKey !== lastSnapshotKey;
  lastSnapshotKey = snapshotKey;

  if (!activeStrand) {
    activeStrand = STRAND_ORDER.find((s) => concepts.some((c) => c.strand === s)) ?? concepts[0]?.strand ?? null;
  }
  // Only touch the DOM when something a tutor could actually see has
  // changed -- render() (see below) replaces all four regions, which
  // replays their entrance animations. Doing that every 15s regardless of
  // whether data moved is what caused the whole dashboard to visibly
  // flash/blink on every poll.
  if (changed) render();
  else updateMeta();
}

function updateMeta() {
  const { report } = cache;
  meta.textContent = `${report.cohort_size} children · generated ${new Date(report.generated_at).toLocaleString()}`;
}

// -------------------- render root --------------------
// Four independent regions -- sidebar stats, tab bar, tab content, roster
// strip -- each swapped in isolation (whole-node replaceWith, not
// app.innerHTML="") so a given action only touches the DOM of the region it
// actually changed. This used to be one render() that tore down and rebuilt
// the entire page on every click; combined with this surface's entrance
// animations (fade-in/fade-up on nearly every card), that made clicking
// anything -- even a roster page arrow -- visibly flash the whole screen.
// Specific state-changing functions below (setTab, setStudent, roster
// pagination, ...) call only the renderX() functions their change actually
// touches; render() itself is used only where everything might have moved
// (the initial load, and a poll that found real changes).

let pulseMount = null;
let tabbarMount = null;
let panelMount = null;
let rosterMount = null;

function buildPanel() {
  const panel = el("div", { class: "tab-panel" });
  if (activeTab === "overview") {
    panel.appendChild(needsHumanBlock());
    if (selectedStudentId) panel.appendChild(whyNextBlock());
  } else if (activeTab === "history") {
    panel.appendChild(historyBlock());
  } else if (activeTab === "patterns") {
    panel.appendChild(el("div", { class: "grid-2 tv-fill" }, [clustersBlock(), retentionBlock()]));
  } else {
    panel.appendChild(conceptMapBlock());
  }
  return panel;
}

function buildRosterRegion() {
  return el("div", { class: "roster-region" }, [rosterBlock()]);
}

// Builds the persistent shell once and mounts all four regions into it.
// Single-screen shell: a fixed left column of cohort-pulse stats, and a
// right column stacking the tabbed content (flexes to fill remaining
// height, scrolls internally) above the roster strip (sized to its own
// content). See .dashboard-shell in index.html for the grid this fills.
function renderShell() {
  pulseMount = pulseCol();
  tabbarMount = tabBar();
  panelMount = buildPanel();
  rosterMount = buildRosterRegion();
  app.innerHTML = "";
  app.appendChild(pulseMount);
  app.appendChild(
    el("div", { class: "right-col" }, [
      el("div", { class: "tab-region" }, [tabbarMount, panelMount]),
      rosterMount,
    ]),
  );
}

function renderPulse() {
  if (!cache || !pulseMount) return;
  const fresh = pulseCol();
  pulseMount.replaceWith(fresh);
  pulseMount = fresh;
}
function renderTabBar() {
  if (!cache || !tabbarMount) return;
  const fresh = tabBar();
  tabbarMount.replaceWith(fresh);
  tabbarMount = fresh;
}
function renderPanel() {
  if (!cache || !panelMount) return;
  const fresh = buildPanel();
  panelMount.replaceWith(fresh);
  panelMount = fresh;
}
function renderRoster() {
  if (!cache || !rosterMount) return;
  const fresh = buildRosterRegion();
  rosterMount.replaceWith(fresh);
  rosterMount = fresh;
}

function render() {
  if (!cache) return;
  updateMeta();
  if (!pulseMount) renderShell();
  else {
    renderPulse();
    renderTabBar();
    renderPanel();
    renderRoster();
  }
}

// -------------------- cohort pulse (glanceable header stats) --------------------
// A scan-first summary row above the roster: a mastery gauge (this child's,
// or the whole cohort's, mirroring how the rest of the page already scopes
// by selectedStudentId) plus three counts pulled from data the tabs below
// already compute -- report.coverage (concept map), filteredStuck/
// filteredRetention (overview/patterns tabs) -- so this row never drifts out
// of sync with the detail views it summarizes.

function cohortMasteryPct() {
  const { report, concepts, beliefByStudent } = cache;
  if (selectedStudentId) {
    const belief = beliefByStudent.get(selectedStudentId) ?? [];
    const masteredN = belief.filter((b) => b.status === "MASTERED").length;
    return concepts.length ? Math.round((masteredN / concepts.length) * 100) : 0;
  }
  const totalMastered = report.coverage.reduce((sum, c) => sum + c.mastered_n, 0);
  const totalPossible = concepts.length * report.cohort_size;
  return totalPossible ? Math.round((totalMastered / totalPossible) * 100) : 0;
}

function gaugeTile(pct, label) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = circumference * (1 - clamped / 100);
  return el("div", { class: "pulse-tile pulse-gauge" }, [
    el("div", {
      class: "gauge-ring",
      html: `<svg viewBox="0 0 108 108"><circle class="gauge-track" cx="54" cy="54" r="${r}"/><circle class="gauge-fill" cx="54" cy="54" r="${r}" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/></svg><div class="gauge-center"><span class="gauge-pct">${clamped}%</span></div>`,
    }),
    el("div", { class: "pulse-label" }, [icon("gauge", "icon"), label]),
  ]);
}

function pulseStatTile(iconName, tint, value, label) {
  return el("div", { class: `pulse-tile pulse-stat ${tint}` }, [
    el("span", { class: "pulse-icon" }, [icon(iconName)]),
    el("div", { class: "pulse-body" }, [
      el("div", { class: "pulse-value" }, String(value)),
      el("div", { class: "pulse-label" }, label),
    ]),
  ]);
}

function pulseCol() {
  const { report } = cache;
  return el("div", { class: "pulse-col" }, [
    gaugeTile(cohortMasteryPct(), selectedStudentId ? "mastery — this child" : "cohort mastery"),
    pulseStatTile("users", "moss", report.cohort_size, "children in cohort"),
    pulseStatTile("support", "amber", filteredStuck().length, "needs extra support"),
    pulseStatTile("trendDown", "purple", filteredRetention().length, "decayed since mastery"),
  ]);
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
      { class: "roster-arrow", disabled: rosterPage === 0 ? "true" : null, onclick: () => { rosterPage -= 1; renderRoster(); } },
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
      { class: "roster-arrow", disabled: rosterPage >= totalPages - 1 ? "true" : null, onclick: () => { rosterPage += 1; renderRoster(); } },
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
    { id: "overview", label: "Overview", icon: "support", count: stuckCount },
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
  const { directory, conceptById } = cache;
  const stuck = filteredStuck();
  const hueOf = new Map(directory.map((d, i) => [d.student_id, i]));

  const block = el("div", { class: "card card-pad tv-section" }, [
    el("div", { class: "sec-h" }, [
      el("span", { class: "icon-wrap amber" }, [icon("support")]),
      el("span", { class: "sec-title" }, "Needs extra support"),
      el("span", { class: "badge amber" }, String(stuck.length)),
    ]),
  ]);
  if (stuck.length === 0) {
    block.appendChild(el("div", { class: "empty" }, "No one needs extra support right now."));
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
              el("span", { class: "chip chip--stuck", "data-concept-id": s.concept_id }, [
                el("span", { class: "dot" }),
                `${conceptById[s.concept_id]?.label ?? s.concept_id} · ${s.attempts_without_mastery} sessions`,
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
        el("button", { disabled: needsPage === 0 ? "true" : null, onclick: () => { needsPage -= 1; renderPanel(); } }, [icon("chevronLeft")]),
        el("span", { class: "pager-note" }, `${needsPage + 1} / ${totalPages}`),
        el("button", { disabled: needsPage >= totalPages - 1 ? "true" : null, onclick: () => { needsPage += 1; renderPanel(); } }, [icon("chevronRight")]),
      ]),
    );
  }
  return block;
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
        el("span", { class: "mono-chip", "data-concept-id": entry.concept_id }, label),
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

// One-line teaser shown in the collapsed header so the panel isn't literally
// invisible content when a tutor doesn't (yet) click it open -- reuses the
// same data the expanded body renders, just the headline part of it.
function whyTeaser(data) {
  if (!data || data === "loading") return null;
  if (data.assignment) return `next up: ${GAME_LABEL[data.assignment.game_id] ?? data.assignment.game_id}`;
  if (data.reason) return "no assignment this round";
  return null;
}

function whyNextBlock() {
  const { directory, conceptById } = cache;
  const student = directory.find((d) => d.student_id === selectedStudentId);
  const data = assignmentByStudent.get(selectedStudentId);

  const header = el(
    "button",
    { class: "why-toggle", onclick: () => { whyOpen = !whyOpen; renderPanel(); } },
    [
      el("span", { class: "why-chevron" + (whyOpen ? " open" : "") }, [icon("chevronDown")]),
      el("span", { class: "icon-wrap gray" }, [icon("bulb")]),
      el("span", { class: "sec-title" }, `Why this next${student ? ` — ${student.name}` : ""}`),
      el("span", { class: "why-hint" }, (!whyOpen && whyTeaser(data)) || "routing trace"),
    ],
  );
  // Only fill/scroll independently while actually expanded -- collapsed,
  // it's just a one-line header and should size to that, not stretch to
  // claim the rest of the tab-panel's height.
  const block = el("div", { class: "card card-pad tv-section why-block" + (whyOpen ? " tv-fill" : "") }, [header]);
  if (!whyOpen) return block;

  if (data === "loading" || data === undefined) {
    block.appendChild(loadingRow("Computing the engine's next decision..."));
    return block;
  }

  const body = el("div", { class: "why-body" });

  const refreshRow = el("div", { class: "why-refresh-row" }, [
    el("span", { class: "why-note" }, "A live, read-only snapshot of the routing engine's current decision for this child -- not a record of what was actually assigned."),
    el("button", { class: "pill-link why-refresh", onclick: () => { loadAssignmentFor(selectedStudentId, true); renderPanel(); } }, [icon("refresh", "icon icon-sm"), "refresh"]),
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
    const items = [];
    data.escalations.forEach((cid, i) => {
      if (i > 0) items.push(", ");
      items.push(el("span", { class: "mono-chip", "data-concept-id": cid }, conceptById[cid]?.label ?? cid));
    });
    body.appendChild(el("div", { class: "why-note" }, ["Currently flagged as needing extra support: ", ...items]));
  }

  block.appendChild(body);
  return block;
}

// -------------------- test history: every past test, drill into questions --------------------

function historyBlock() {
  const { directory } = cache;
  const block = el("div", { class: "card card-pad tv-section tv-fill" }, [
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
        summary.concept_ids.map((cid) => el("span", { class: "mono-chip", "data-concept-id": cid }, conceptById[cid]?.label ?? cid)),
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
            el("span", { class: "mono-chip", "data-concept-id": o.concept_id }, conceptById[o.concept_id]?.label ?? o.concept_label),
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
                        ...o.blamed_concepts.map((b) => el("span", { class: "node root", "data-concept-id": b.concept_id }, b.label)),
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
          el("span", { class: "node", "data-concept-id": c.concept_id }, label),
          el("span", {}, c.signature.toLowerCase().replace(/_/g, " ")),
          rootLabel
            ? el("div", { class: "cluster-chain" }, [icon("arrow", "icon arrow"), el("span", { class: "node root", "data-concept-id": c.root_cause }, rootLabel)])
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
          el("span", {}, [el("span", { class: "name" }, r.name), " — ", el("span", { class: "concept", "data-concept-id": r.concept_id }, label)]),
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

  const block = el("div", { class: "card card-pad tv-section tv-fill" }, [
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
        el("span", { class: "cid", "data-concept-id": node.concept_id }, node.concept_id),
        el("div", { class: "clabel" }, node.label),
        el("div", { class: "cfoot" }, [el("span", { class: "n" }, "unmeasured")]),
      ]);
    }
    const m = STATUS_META[b.status] ?? STATUS_META.EMERGING;
    return el("div", { class: `concept-tile ${m.solo}` }, [
      el("span", { class: "cid", "data-concept-id": node.concept_id }, node.concept_id),
      el("div", { class: "clabel" }, node.label),
      el("div", { class: "cfoot" }, [el("span", { class: "n" }, m.label), el("span", { class: "n" }, `p=${b.p_mastery.toFixed(2)}`)]),
    ]);
  }

  if (!coverage || coverage.measured_n === 0) {
    return el("div", { class: "concept-tile unmeasured" }, [
      el("span", { class: "cid", "data-concept-id": node.concept_id }, node.concept_id),
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
    el("span", { class: "cid", "data-concept-id": node.concept_id }, node.concept_id),
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

// -------------------- concept tooltip --------------------
// Every place a bare concept id (N.MAG, G.PART, ...) or its resolved label
// shows up carries data-concept-id (see needsHumanBlock, decisionRow,
// clustersBlock, etc. above) -- a tutor unfamiliar with the id vocabulary
// can hover any of them to see the concept's full label, strand and grade
// band without leaving the page. One tooltip element is built once and
// repositioned/repopulated per hover via event delegation on `document`,
// rather than one tooltip per chip: cheap regardless of how many chips are
// on screen, and needs no rewiring when render() rebuilds the DOM.

let tooltipEl = null;
let tooltipHideTimer = null;

function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = el("div", { class: "concept-tooltip", role: "tooltip" });
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function conceptMetaLine(concept) {
  const strand = STRAND_LABEL[concept.strand] ?? concept.strand;
  const [lo, hi] = concept.grade_band ?? [];
  const fmt = (g) => (g === 0 ? "K" : String(g));
  const gradeText = lo != null && hi != null ? (lo === hi ? `Grade ${fmt(lo)}` : `Grades ${fmt(lo)}–${fmt(hi)}`) : null;
  return [strand, gradeText].filter(Boolean).join(" · ");
}

function showConceptTooltip(target, conceptId) {
  const concept = cache?.conceptById?.[conceptId];
  if (!concept) return;
  clearTimeout(tooltipHideTimer);
  const tip = ensureTooltipEl();
  tip.innerHTML = "";
  tip.appendChild(el("span", { class: "tt-id" }, conceptId));
  tip.appendChild(el("span", { class: "tt-label" }, concept.label));
  const meta = conceptMetaLine(concept);
  if (meta) tip.appendChild(el("span", { class: "tt-meta" }, meta));

  // Open (and measure) before placing: default above the chip, flipping
  // below if there isn't room, and clamped horizontally so it never runs
  // off either edge of the viewport -- position: fixed (see .concept-tooltip
  // in index.html) means none of this is at the mercy of any scrolling
  // ancestor's overflow clipping.
  tip.classList.add("open");
  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const gap = 8;
  let top = rect.top - tipRect.height - gap;
  let originY = "bottom";
  if (top < 8) {
    top = rect.bottom + gap;
    originY = "top";
  }
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  const originX = left + tipRect.width / 2 < rect.left + rect.width / 2 ? "right" : "left";
  tip.style.setProperty("--tt-origin-y", originY);
  tip.style.setProperty("--tt-origin-x", originX);
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

function hideConceptTooltip(immediate) {
  if (!tooltipEl) return;
  clearTimeout(tooltipHideTimer);
  if (immediate) {
    tooltipEl.classList.remove("open");
    return;
  }
  tooltipHideTimer = setTimeout(() => tooltipEl.classList.remove("open"), 60);
}

function initConceptTooltips() {
  document.addEventListener("mouseover", (e) => {
    const target = e.target.closest("[data-concept-id]");
    if (!target) return;
    showConceptTooltip(target, target.getAttribute("data-concept-id"));
  });
  document.addEventListener("mouseout", (e) => {
    const target = e.target.closest("[data-concept-id]");
    if (!target) return;
    if (e.relatedTarget && target.contains(e.relatedTarget)) return;
    hideConceptTooltip(false);
  });
  // Any scroll (the tab panel, a Patterns column, the routing trace) moves
  // the hovered chip relative to the viewport; the fixed-position tooltip
  // would otherwise drift out of alignment with it, so just dismiss it --
  // it reappears immediately on the next hover. `capture: true` because
  // scroll events don't bubble.
  document.addEventListener("scroll", () => hideConceptTooltip(true), true);
}

initConceptTooltips();

load();
setInterval(load, 15000);
