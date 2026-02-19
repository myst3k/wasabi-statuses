const API_BASE = "https://status.wasabi.com/api/v2";
const DAYS = 90;

const tooltip = document.getElementById("tooltip");

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function minutesBetween(a, b) {
  return Math.max(0, (b - a) / 60000);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatDuration(minutes) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function impactSeverity(impact) {
  const order = { critical: 4, major: 3, minor: 2, maintenance: 1, none: 0 };
  return order[impact] ?? 0;
}

function impactClass(impact) {
  if (impact === "critical" || impact === "major") return "major";
  if (impact === "minor") return "minor";
  if (impact === "maintenance") return "maintenance";
  return "operational";
}

// Build per-component, per-day downtime maps from incidents
function buildDowntimeMaps(incidents, components) {
  const now = new Date();
  const windowStart = daysAgo(DAYS);

  // Map: componentId -> { dayKey -> { minutes, maxImpact } }
  const maps = {};
  for (const c of components) {
    maps[c.id] = {};
  }

  // Also track "overall" across all components
  maps["__overall__"] = {};

  for (const inc of incidents) {
    const start = new Date(inc.started_at || inc.created_at);
    const end = inc.resolved_at ? new Date(inc.resolved_at) : now;
    const impact = inc.impact || "minor";

    if (end < windowStart) continue;

    const clippedStart = start < windowStart ? windowStart : start;
    const clippedEnd = end > now ? now : end;

    // Find affected component IDs
    const affectedIds = new Set();
    for (const upd of inc.incident_updates || []) {
      for (const ac of upd.affected_components || []) {
        affectedIds.add(ac.code);
      }
    }

    // If no specific components, attribute to overall only
    const targets =
      affectedIds.size > 0 ? [...affectedIds, "__overall__"] : ["__overall__"];

    // Walk day by day
    const cursor = new Date(clippedStart);
    cursor.setUTCHours(0, 0, 0, 0);

    while (cursor <= clippedEnd) {
      const dk = dayKey(cursor);
      const dayStart = new Date(cursor);
      const dayEnd = new Date(cursor);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const overlapStart = clippedStart > dayStart ? clippedStart : dayStart;
      const overlapEnd = clippedEnd < dayEnd ? clippedEnd : dayEnd;
      const mins = minutesBetween(overlapStart, overlapEnd);

      if (mins > 0) {
        for (const id of targets) {
          if (!maps[id]) continue;
          if (!maps[id][dk]) {
            maps[id][dk] = { minutes: 0, maxImpact: "none" };
          }
          maps[id][dk].minutes += mins;
          if (impactSeverity(impact) > impactSeverity(maps[id][dk].maxImpact)) {
            maps[id][dk].maxImpact = impact;
          }
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return maps;
}

function calcUptime(dayMap) {
  let totalDown = 0;
  const totalMinutes = DAYS * 24 * 60;
  for (const dk in dayMap) {
    totalDown += Math.min(dayMap[dk].minutes, 24 * 60);
  }
  return Math.max(0, ((totalMinutes - totalDown) / totalMinutes) * 100);
}

function uptimeClass(pct) {
  if (pct >= 99.999) return "uptime-100";
  if (pct >= 99.9) return "uptime-high";
  if (pct >= 99.0) return "uptime-low";
  return "uptime-bad";
}

// Tooltip handling
function showTooltip(e, html) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  positionTooltip(e);
}

function positionTooltip(e) {
  const rect = tooltip.getBoundingClientRect();
  let x = e.clientX + 12;
  let y = e.clientY - rect.height - 8;
  if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - 12;
  if (y < 8) y = e.clientY + 16;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

function hideTooltip() {
  tooltip.hidden = true;
}

// Render 90-day uptime bar for a component
function renderUptimeBar(dayMap) {
  const bar = document.createElement("div");
  bar.className = "uptime-bar";

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = daysAgo(i);
    const dk = dayKey(date);
    const info = dayMap[dk];
    const dayEl = document.createElement("div");
    dayEl.className = `day-bar ${info ? impactClass(info.maxImpact) : "operational"}`;

    const label = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    dayEl.addEventListener("mouseenter", (e) => {
      const status = info
        ? `${info.maxImpact} &middot; ${formatDuration(info.minutes)} downtime`
        : "Operational";
      showTooltip(
        e,
        `<div class="tooltip-date">${label}</div><div class="tooltip-status">${status}</div>`
      );
    });
    dayEl.addEventListener("mousemove", positionTooltip);
    dayEl.addEventListener("mouseleave", hideTooltip);
    bar.appendChild(dayEl);
  }

  return bar;
}

function renderComponentRow(component, dayMap) {
  const uptime = calcUptime(dayMap);
  const row = document.createElement("div");
  row.className = "component-row";

  const header = document.createElement("div");
  header.className = "component-header";

  const name = document.createElement("span");
  name.className = "component-name";
  name.textContent = component.name;

  const pct = document.createElement("span");
  pct.className = `component-uptime ${uptimeClass(uptime)}`;
  pct.textContent = `${uptime.toFixed(uptime >= 99.99 ? 2 : 1)}% uptime`;

  header.appendChild(name);
  header.appendChild(pct);
  row.appendChild(header);
  row.appendChild(renderUptimeBar(dayMap));

  return row;
}

function renderIncidentCard(incident) {
  const card = document.createElement("div");
  card.className = "incident-card";

  const start = new Date(incident.started_at || incident.created_at);
  const end = incident.resolved_at ? new Date(incident.resolved_at) : null;
  const duration = end ? minutesBetween(start, end) : null;

  // Collect affected components
  const compNames = new Set();
  for (const upd of incident.incident_updates || []) {
    for (const ac of upd.affected_components || []) {
      compNames.add(ac.name);
    }
  }

  card.innerHTML = `
    <div class="incident-header">
      <div class="incident-title">
        <a href="${incident.shortlink}" target="_blank">${incident.name}</a>
      </div>
    </div>
    <div class="incident-meta">
      <span class="badge ${incident.impact || "none"}">${incident.impact || "none"}</span>
      <span class="incident-date">${formatDate(incident.started_at || incident.created_at)}</span>
      ${duration !== null ? `<span class="incident-duration">&middot; ${formatDuration(duration)}</span>` : ""}
    </div>
    ${
      compNames.size > 0
        ? `<div class="incident-components">${[...compNames]
            .map((n) => `<span class="component-tag">${n}</span>`)
            .join("")}</div>`
        : ""
    }
  `;

  // Updates (collapsed by default)
  const updates = (incident.incident_updates || []).slice().reverse();
  if (updates.length > 0) {
    const toggle = document.createElement("button");
    toggle.className = "incident-toggle";
    toggle.textContent = "Show updates";

    const updatesDiv = document.createElement("div");
    updatesDiv.className = "incident-updates";
    updatesDiv.hidden = true;

    for (const upd of updates) {
      const item = document.createElement("div");
      item.className = "update-item";
      item.innerHTML = `
        <span class="update-status ${upd.status}">${upd.status}</span>
        <span class="update-body">${upd.body}</span>
        <span class="update-time">${formatTime(upd.created_at)}</span>
      `;
      updatesDiv.appendChild(item);
    }

    toggle.addEventListener("click", () => {
      updatesDiv.hidden = !updatesDiv.hidden;
      toggle.textContent = updatesDiv.hidden ? "Show updates" : "Hide updates";
    });

    card.appendChild(toggle);
    card.appendChild(updatesDiv);
  }

  return card;
}

function setOverallStatus(summary) {
  const el = document.getElementById("overall-status");
  el.classList.remove("loading");

  const indicator = summary.status?.indicator || "none";
  if (indicator === "none") {
    el.textContent = "All Systems Operational";
    el.classList.add("operational");
  } else if (indicator === "minor" || indicator === "maintenance") {
    el.textContent = summary.status?.description || "Partial Issues";
    el.classList.add("degraded");
  } else {
    el.textContent = summary.status?.description || "Major Outage";
    el.classList.add("outage");
  }
}

async function main() {
  try {
    const [summary, incidentsData] = await Promise.all([
      fetchJSON("/summary.json"),
      fetchJSON("/incidents.json"),
    ]);

    const components = summary.components || [];
    const incidents = incidentsData.incidents || [];

    setOverallStatus(summary);

    const downtimeMaps = buildDowntimeMaps(incidents, components);

    // Split into regions vs services
    const regionPattern = /^(US|EU|AP|CA)-/;
    const regions = components.filter((c) => regionPattern.test(c.name));
    const services = components.filter((c) => !regionPattern.test(c.name));

    const regionsGrid = document.getElementById("regions-grid");
    for (const c of regions) {
      regionsGrid.appendChild(renderComponentRow(c, downtimeMaps[c.id] || {}));
    }

    const servicesGrid = document.getElementById("services-grid");
    for (const c of services) {
      servicesGrid.appendChild(
        renderComponentRow(c, downtimeMaps[c.id] || {})
      );
    }

    // Render incidents
    const listEl = document.getElementById("incidents-list");
    listEl.innerHTML = "";

    if (incidents.length === 0) {
      listEl.innerHTML =
        '<p class="no-incidents">No incidents in the last 90 days.</p>';
    } else {
      for (const inc of incidents) {
        listEl.appendChild(renderIncidentCard(inc));
      }
    }
  } catch (err) {
    console.error("Failed to load status data:", err);
    document.getElementById("overall-status").textContent =
      "Failed to load status data";
  }
}

main();
