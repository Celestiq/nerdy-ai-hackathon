const app = document.getElementById("app");
document.getElementById("tutorLink").href = "/tutor/";

const state = {
  student: null,
  assignment: null,
  items: [],
  index: 0,
  observations: [],
  sessionId: null,
  sessionStartedAt: null,
};

async function api(path, opts) {
  const res = await fetch(`/api${path}`, opts);
  return res.json();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
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

// -------------------- picker --------------------

async function showPicker() {
  const directory = await api("/directory");
  const buttons = directory.map((d) =>
    el("button", { onclick: () => startSession(d) }, d.name),
  );
  render(
    el("div", {}, [
      el("h1", {}, "Who's playing?"),
      el("div", { class: "picker" }, buttons),
    ]),
  );
}

async function startSession(student) {
  state.student = student;
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
  state.index = 0;

  const ids = state.assignment.item_specs.map((s) => s.item_id).join(",");
  state.items = await api(`/items/${state.assignment.game_id}?ids=${ids}`);

  showItem();
}

function showEmpty(result) {
  const msg =
    result.escalations && result.escalations.length > 0
      ? "Nothing to play right now -- your teacher's got this one. Check back after class!"
      : "You're all caught up for now. Come back soon!";
  render(
    el("div", { class: "empty-card" }, [
      el("h2", {}, "All done"),
      el("p", {}, msg),
      el("button", { class: "done-btn", onclick: showPicker }, "Back"),
    ]),
  );
}

// -------------------- gameplay --------------------

function currentSpec() {
  return state.assignment.item_specs[state.index];
}
function currentItem() {
  const spec = currentSpec();
  return state.items.find((i) => i.item_id === spec.item_id);
}

function progressDots() {
  const total = state.assignment.item_specs.length;
  const dots = [];
  for (let i = 0; i < total; i++) {
    dots.push(el("div", { class: "dot" + (i < state.index ? " done" : "") }));
  }
  return el("div", {}, [
    el("div", { class: "progress" }, dots),
    el("div", { class: "progress-note" }, `${total - state.index} to go -- not a score`),
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
        el("div", { class: "who" }, state.student.name),
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
  const observation = await api(`/games/${state.assignment.game_id}/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, attempts: 1 }),
  });
  state.observations.push(observation);
  state.index += 1;
  render(el("div", { class: "stage" }, [el("div", { class: "feedback-note" }, "Nice -- next one")]));
  setTimeout(showItem, 420);
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
  await api("/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bundle) });

  render(
    el("div", { class: "end-card" }, [
      el("h2", {}, "What you built today"),
      el("p", {}, `You worked through ${state.observations.length} ${state.observations.length === 1 ? "item" : "items"}. That effort counts, whatever the answers were.`),
      el("p", {}, "No score, no comparison to anyone else."),
      el("button", { class: "done-btn", onclick: showPicker }, "Done"),
    ]),
  );
}

showPicker();
