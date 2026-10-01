const TOKEN_KEY = "azzurro_admin_token";

const els = {
  status: document.getElementById("statusText"),
  authCard: document.getElementById("authCard"),
  dashCard: document.getElementById("dashCard"),
  tokenInput: document.getElementById("tokenInput"),
  tokenSaveBtn: document.getElementById("tokenSaveBtn"),
  tokenClearBtn: document.getElementById("tokenClearBtn"),
  authError: document.getElementById("authError"),
  filters: document.getElementById("filters"),
  counts: document.getElementById("counts"),
  rows: document.getElementById("rows"),
  emptyState: document.getElementById("emptyState"),
  detailWrap: document.getElementById("detailWrap"),
  refreshBtn: document.getElementById("refreshBtn"),
  lastRefreshed: document.getElementById("lastRefreshed"),
};

const OPS_COVERS = {
  2: "Cleaning shifts & how cleaning happens • task ownership • where receptionists fit in • contractors • how guests find us • check-in process • reception info • how issues and complaints are reported and escalated",
  5: "Reporting path • who owns the fix • timelines • escalation",
};

let token = localStorage.getItem(TOKEN_KEY) || "";
let activeSlug = "";
let refreshTimer = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function fmtRelative(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function api(path) {
  const res = await fetch(path, { headers: { "x-admin-token": token } });
  if (res.status === 401) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function showAuth(message) {
  els.authCard.classList.remove("hidden");
  els.dashCard.classList.add("hidden");
  if (message) {
    els.authError.textContent = message;
    els.authError.classList.remove("hidden");
  }
  clearInterval(refreshTimer);
}

function showDash() {
  els.authCard.classList.add("hidden");
  els.dashCard.classList.remove("hidden");
}

async function loadList() {
  try {
    const data = await api(`/api/admin/interviews${activeSlug ? `?slug=${encodeURIComponent(activeSlug)}` : ""}`);
    showDash();
    els.status.textContent = "Live";
    renderCounts(data.counts || [], data.interviews.length);
    renderRows(data.interviews || []);
    els.lastRefreshed.textContent = `Last refreshed ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    if (e.status === 401) {
      showAuth("Invalid or missing token.");
      return;
    }
    els.status.textContent = "Error";
    console.error(e);
    showAuth(e.message);
  }
}

function renderCounts(counts, total) {
  const parts = [`<div class="countchip">Total: ${total}</div>`];
  for (const c of counts) {
    parts.push(`<div class="countchip">${escapeHtml(c.status)}: ${c.count}</div>`);
  }
  els.counts.innerHTML = parts.join("");
}

function renderRows(interviews) {
  els.rows.innerHTML = "";
  els.emptyState.style.display = interviews.length ? "none" : "block";

  for (const it of interviews) {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => loadDetail(it.id));
    tr.innerHTML = `
      <td>
        <div style="font-weight:900;">${escapeHtml(it.candidate_name)}</div>
        <div class="muted">${escapeHtml(it.candidate_email || "")}</div>
      </td>
      <td>${escapeHtml(it.role)}<div class="muted">${escapeHtml(it.slug)}</div></td>
      <td><span class="badgeStatus st-${escapeHtml(it.status)}">${escapeHtml(it.status.replace("_", " "))}</span></td>
      <td>${fmtDate(it.created_at)}</td>
      <td>${fmtDate(it.last_seen_at)}<div class="muted">${fmtRelative(it.last_seen_at)}</div></td>
      <td>${it.answer_count}/${it.total_questions}${it.status === "abandoned" && it.current_question ? `<div class="muted">stopped at Q${it.current_question}</div>` : ""}</td>
      <td>${it.visibility_hidden_count ?? 0}</td>
    `;
    els.rows.appendChild(tr);
  }
}

function mediaTag(url, mimeType) {
  const isVideo = String(mimeType || "").startsWith("video");
  return isVideo
    ? `<video controls playsinline preload="metadata" style="width:100%;margin-top:10px;border-radius:12px;border:1px solid rgba(11,27,43,0.10);background:#fff;"><source src="${escapeHtml(url)}"></video>`
    : `<audio controls preload="metadata" src="${escapeHtml(url)}"></audio>`;
}

async function loadDetail(id) {
  els.detailWrap.innerHTML = `<div class="card detail"><div class="muted">Loading…</div></div>`;
  try {
    const it = await api(`/api/admin/interviews/${encodeURIComponent(id)}`);

    const speed = [
      it.speed_ping_ms != null ? `Ping ${it.speed_ping_ms} ms` : null,
      it.speed_download_mbps != null ? `Down ${it.speed_download_mbps} Mbps` : null,
      it.speed_upload_mbps != null ? `Up ${it.speed_upload_mbps} Mbps` : null,
      it.speed_rating ? `Rating ${it.speed_rating}` : null,
    ].filter(Boolean).join(" • ");

    const meta = `
      <div class="metagrid">
        <div class="metaitem"><span class="k">Candidate</span><span class="v">${escapeHtml(it.candidate_name)}</span></div>
        <div class="metaitem"><span class="k">Track</span><span class="v">${escapeHtml(it.role)} (${escapeHtml(it.slug)})</span></div>
        <div class="metaitem"><span class="k">Status</span><span class="v"><span class="badgeStatus st-${escapeHtml(it.status)}">${escapeHtml(it.status.replace("_", " "))}</span></span></div>
        <div class="metaitem"><span class="k">Created</span><span class="v">${fmtDate(it.created_at)}</span></div>
        <div class="metaitem"><span class="k">Last seen</span><span class="v">${fmtDate(it.last_seen_at)} ${fmtRelative(it.last_seen_at)}</span></div>
        <div class="metaitem"><span class="k">Stopped at</span><span class="v">${it.current_question ? `Question ${it.current_question}` : "—"}</span></div>
        <div class="metaitem"><span class="k">Tab switches</span><span class="v">${it.visibility_hidden_count ?? 0}</span></div>
        <div class="metaitem"><span class="k">Device</span><span class="v">${escapeHtml(it.device_hint || "—")}</span></div>
        ${speed ? `<div class="metaitem"><span class="k">Speed test</span><span class="v">${escapeHtml(speed)}</span></div>` : ""}
        <div class="metaitem"><span class="k">Interview ID</span><span class="v">${escapeHtml(it.id)}</span></div>
      </div>
    `;

    const practice = it.practice_url
      ? `<div class="answerRow">
           <div class="answerQ">Practice recording</div>
           ${mediaTag(it.practice_url, it.practice_mime_type)}
           <div class="answerMeta">${escapeHtml(it.practice_duration_seconds ? `${it.practice_duration_seconds}s` : "")}</div>
         </div>`
      : "";

    const answers = (it.answers || [])
      .map((a) => {
        const cover =
          it.slug === "operations-dev" && OPS_COVERS[a.question_index]
            ? `<div class="cover"><strong>Reviewer note — expected points:</strong> ${escapeHtml(OPS_COVERS[a.question_index])}</div>`
            : "";
        const fu = a.followup_text
          ? `<div class="answerFu"><strong>Follow-up:</strong> ${escapeHtml(a.followup_text)}</div>`
          : "";
        return `
          <div class="answerRow">
            <div class="answerQ">Q${a.question_index}: ${escapeHtml(a.question_text)}</div>
            ${fu}
            ${cover}
            ${mediaTag(a.file_url, a.mime_type)}
            <div class="answerMeta">Duration: ${a.duration_seconds != null ? `${a.duration_seconds}s` : "—"} • ${escapeHtml(a.mime_type || "")}</div>
            <a class="linkbtn" href="${escapeHtml(a.file_url)}" target="_blank" rel="noopener">Open / download recording</a>
          </div>
        `;
      })
      .join("");

    els.detailWrap.innerHTML = `
      <div class="card detail">
        <div class="toolbar">
          <div class="minititle" style="margin:0;">Submission detail</div>
          <button class="ghost2" id="closeDetailBtn" style="flex:0 0 auto;">Close</button>
        </div>
        ${meta}
        ${practice}
        <div class="minititle" style="margin-top:16px;">Responses (${(it.answers || []).length})</div>
        ${answers || `<div class="muted" style="margin-top:8px;">No recordings saved.</div>`}
      </div>
    `;

    document.getElementById("closeDetailBtn").addEventListener("click", () => {
      els.detailWrap.innerHTML = "";
    });
  } catch (e) {
    console.error(e);
    els.detailWrap.innerHTML = `<div class="card detail"><div class="errline">${escapeHtml(e.message)}</div></div>`;
  }
}

// ---- Filters ----
els.filters.addEventListener("click", (e) => {
  const btn = e.target.closest(".filterbtn");
  if (!btn) return;
  activeSlug = btn.dataset.slug || "";
  for (const b of els.filters.querySelectorAll(".filterbtn")) b.classList.toggle("active", b === btn);
  els.detailWrap.innerHTML = "";
  loadList();
});

// ---- Token ----
els.tokenSaveBtn.addEventListener("click", () => {
  token = els.tokenInput.value.trim();
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
  els.authError.classList.add("hidden");
  loadList();
});

els.tokenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.tokenSaveBtn.click();
});

els.tokenClearBtn.addEventListener("click", () => {
  token = "";
  localStorage.removeItem(TOKEN_KEY);
  els.tokenInput.value = "";
  showAuth("Token cleared.");
});

els.refreshBtn.addEventListener("click", loadList);

// ---- Boot ----
if (token) {
  loadList();
} else {
  showAuth();
}

refreshTimer = setInterval(() => {
  if (token && !els.dashCard.classList.contains("hidden")) loadList();
}, 30000);
