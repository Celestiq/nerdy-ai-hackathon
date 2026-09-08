const app = document.getElementById("app");
const meta = document.getElementById("meta");
const COHORT_ID = "coh_demo";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

async function load() {
  const [report, concepts] = await Promise.all([
    fetch(`/api/tutor/report/${COHORT_ID}`).then((r) => r.json()),
    fetch(`/api/graph/concepts`).then((r) => r.json()),
  ]);
  const conceptById = Object.fromEntries(concepts.map((c) => [c.concept_id, c]));

  meta.textContent = `${report.cohort_size} children · generated ${new Date(report.generated_at).toLocaleString()}`;

  app.innerHTML = "";
  app.appendChild(needsHumanBlock(report));
  app.appendChild(
    el("div", { class: "grid" }, [clustersBlock(report, conceptById), retentionBlock(report, conceptById)]),
  );
  app.appendChild(conceptMapBlock(report, conceptById));
  app.appendChild(openingMoveBlock(report));
}

function needsHumanBlock(report) {
  const block = el("div", { class: "block needs-human" }, [
    el("h2", {}, [`Needs a human`, el("span", { class: "badge amber" }, String(report.stuck.length))]),
  ]);
  if (report.stuck.length === 0) {
    block.appendChild(el("div", { class: "empty" }, "No one is stuck right now."));
    return block;
  }
  for (const s of report.stuck) {
    block.appendChild(
      el("div", { class: "row" }, [
        `${s.name} — stuck on ${s.concept_id}`,
        el("div", { class: "sub" }, `${s.attempts_without_mastery} sessions without mastery`),
      ]),
    );
  }
  return block;
}

function clustersBlock(report, conceptById) {
  const block = el("div", { class: "block" }, [
    el("h2", {}, [`Shared misconceptions`, el("span", { class: "badge" }, String(report.clusters.length))]),
  ]);
  if (report.clusters.length === 0) {
    block.appendChild(el("div", { class: "empty" }, "Not enough data yet -- nothing to report."));
    return block;
  }
  for (const c of report.clusters) {
    const label = conceptById[c.concept_id]?.label ?? c.concept_id;
    block.appendChild(
      el("div", { class: "row" }, [
        `${c.names.join(", ")} — ${c.signature.toLowerCase().replace(/_/g, " ")} on ${label}`,
        c.root_cause ? el("div", { class: "cause" }, `root cause → ${conceptById[c.root_cause]?.label ?? c.root_cause}`) : null,
      ]),
    );
  }
  return block;
}

function retentionBlock(report, conceptById) {
  const block = el("div", { class: "block" }, [
    el("h2", {}, [`Lost since earlier`, el("span", { class: "badge" }, String(report.retention.length))]),
  ]);
  if (report.retention.length === 0) {
    block.appendChild(el("div", { class: "empty" }, "Nothing decayed yet."));
    return block;
  }
  for (const r of report.retention) {
    const label = conceptById[r.concept_id]?.label ?? r.concept_id;
    block.appendChild(
      el("div", { class: "row" }, [
        `${r.name} — ${label}`,
        el("div", { class: "sub" }, `mastered before, decayed now (p_decayed ${r.p_decayed.toFixed(2)})`),
      ]),
    );
  }
  return block;
}

function conceptMapBlock(report, conceptById) {
  const block = el("div", { class: "block" }, [el("h2", {}, "Concept map")]);
  const grid = el("div", { class: "concept-grid" });
  for (const row of report.coverage) {
    const node = conceptById[row.concept_id];
    if (!node) continue;
    let cls = "unmeasured";
    if (row.measured_n > 0) {
      if (row.mastered_n > 0 && row.weak_n === 0) cls = "mastered";
      else if (row.weak_n > 0 && row.mastered_n === 0) cls = "weak";
      else if (row.weak_n > 0 || row.mastered_n > 0) cls = "mixed";
    }
    grid.appendChild(
      el("div", { class: `concept-tile ${cls}` }, [el("span", { class: "cid" }, row.concept_id), node.label]),
    );
  }
  block.appendChild(grid);
  block.appendChild(
    el("div", { class: "legend" }, [
      el("span", {}, [el("span", { class: "swatch", style: "background:var(--trace)" }), "mastered"]),
      el("span", {}, [el("span", { class: "swatch", style: "background:var(--signal)" }), "weak (measured, confident)"]),
      el("span", {}, [el("span", { class: "swatch", style: "background:var(--rule-lite)" }), "mixed across cohort"]),
      el("span", {}, [el("span", { class: "swatch", style: "background:transparent;border:1.5px dashed var(--rule)" }), "unmeasured -- not the same as weak"]),
    ]),
  );
  return block;
}

function openingMoveBlock(report) {
  const block = el("div", { class: "block opening-move" }, [el("h2", {}, "Suggested opening -- 5 min")]);
  if (!report.opening_move) {
    block.appendChild(el("div", { class: "empty" }, "Not enough data yet for a specific suggestion."));
    return block;
  }
  block.appendChild(el("div", { class: "row" }, report.opening_move.text));
  return block;
}

load();
setInterval(load, 15000);
