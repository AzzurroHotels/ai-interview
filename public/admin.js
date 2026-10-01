const els = {
  loginView: document.getElementById("loginView"),
  adminView: document.getElementById("adminView"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  password: document.getElementById("password"),
  logoutBtn: document.getElementById("logoutBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  searchInput: document.getElementById("searchInput"),
  summary: document.getElementById("summary"),
  list: document.getElementById("submissionList"),
  emptyState: document.getElementById("emptyState"),
  detail: document.getElementById("detailView"),
};

let submissions = [];
let selectedId = null;

const OPS_COVERS = {
  2: "Cleaning shifts & how cleaning happens • task ownership • where receptionists fit in • contractors • how guests find us • check-in process • reception info • how issues and complaints are reported and escalated",
  5: "Reporting path • who owns the fix • timelines • escalation",
};

function mediaTag(url, mimeType) {
  const isVideo = String(mimeType || "").startsWith("video");
  return isVideo
    ? `<video controls preload="metadata" src="${escapeHtml(url)}"></video>`
    : `<audio controls preload="metadata" src="${escapeHtml(url)}"></audio>`;
}

function showLogin() {
  els.loginView.classList.remove("hidden");
  els.adminView.classList.add("hidden");
  els.logoutBtn.classList.add("hidden");
}

function showAdmin() {
  els.loginView.classList.add("hidden");
  els.adminView.classList.remove("hidden");
  els.logoutBtn.classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(value) {
  if (!value) return "Unknown date";
  const normalized = String(value).includes("T") ? value : `${value} UTC`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(value) {
  return `status ${String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function renderList() {
  const total = submissions.length;
  const failed = submissions.filter((s) => s.email_status === "failed").length;
  const sent = submissions.filter((s) => s.email_status === "sent").length;
  const abandoned = submissions.filter((s) => s.status === "abandoned").length;
  els.summary.textContent = `${total} submissions. ${sent} emails sent. ${failed} email failures. ${abandoned} abandoned.`;

  if (!submissions.length) {
    els.list.innerHTML = `<div class="empty-list">No submissions found.</div>`;
    return;
  }

  els.list.innerHTML = submissions.map((item) => `
    <button class="submission-row ${item.id === selectedId ? "active" : ""}" type="button" data-id="${escapeHtml(item.id)}">
      <span class="row-main">
        <strong>${escapeHtml(item.candidate_name)}</strong>
        <span>${escapeHtml(item.candidate_email || "No email")} · ${escapeHtml(item.role)}</span>
      </span>
      <span class="row-meta">
        <span class="badges">
          <span class="${statusClass(item.status)}">${escapeHtml((item.status || "unknown").replaceAll("_", " "))}</span>
          <span class="${statusClass(item.email_status)}">${escapeHtml(item.email_status || "pending")}</span>
        </span>
        <span>${fmtDate(item.created_at)}</span>
        ${item.answer_count ? `<span>${item.transcribed_count}/${item.answer_count} transcribed${item.avg_score != null ? ` · avg ${item.avg_score}` : ""}</span>` : ""}
        ${["abandoned", "in_progress"].includes(item.status) ? `<span>Last seen ${fmtDate(item.last_seen_at)}</span>` : ""}
      </span>
    </button>
  `).join("");
}

async function loadSubmissions() {
  els.summary.textContent = "Loading submissions...";
  const query = els.searchInput.value.trim();
  const data = await api(`/api/admin/submissions?limit=200&q=${encodeURIComponent(query)}`);
  submissions = data.submissions || [];
  renderList();
}

function stat(label, value) {
  return `
    <div class="stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? "-")}</strong>
    </div>
  `;
}

function aiStatusClass(kind, value) {
  const v = String(value || "pending").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return `status ${kind}-${v}`;
}

function renderDetail(submission) {
  const answers = submission.answers || [];
  const practice = submission.practice_url ? `
    <section>
      <h3>Practice Recording</h3>
      ${mediaTag(submission.practice_url, submission.practice_mime_type)}
    </section>
  ` : "";

  const transcribed = answers.filter((a) => a.transcript_status === "done").length;
  const scored = answers.map((a) => a.grade_score).filter((s) => s !== null && s !== undefined);
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;

  const answerHtml = answers.map((answer) => {
    let grade = null;
    try {
      grade = answer.grade_json ? JSON.parse(answer.grade_json) : null;
    } catch {
      grade = null;
    }

    const transcriptBlock = answer.transcript
      ? `<details class="transcript" open><summary>Transcript</summary><p>${escapeHtml(answer.transcript)}</p></details>`
      : `<p class="muted">Not transcribed yet.${answer.transcript_error ? ` <span class="error-inline">${escapeHtml(answer.transcript_error)}</span>` : ""}</p>`;

    const gradeBlock = grade
      ? `<div class="grade">
          <div class="grade-head">
            <span class="score ${answer.grade_score >= 70 ? "high" : answer.grade_score >= 40 ? "mid" : "low"}">${answer.grade_score ?? "—"}/100</span>
            <strong>Auto-grade</strong>
          </div>
          ${grade.summary ? `<p class="muted">${escapeHtml(grade.summary)}</p>` : ""}
          <ul class="verdicts">
            ${(grade.verdicts || []).map((v) => `<li><span class="mark ${v.mark === 1 ? "m1" : v.mark === 0.5 ? "mhalf" : "m0"}">${v.mark ?? 0}</span> ${escapeHtml(v.point || "")} <span class="muted">${escapeHtml(v.note || "")}</span></li>`).join("")}
          </ul>
        </div>`
      : answer.grade_status === "error" && answer.grade_error
        ? `<div class="notice">Grading error: ${escapeHtml(answer.grade_error)}</div>`
        : "";

    return `
      <section class="answer">
        <div class="answer-head">
          <h3>Question ${escapeHtml(answer.question_index)}</h3>
          <span class="badges">
            <span class="${aiStatusClass("t", answer.transcript_status)}">transcript: ${escapeHtml(answer.transcript_status || "pending")}</span>
            <span class="${aiStatusClass("g", answer.grade_status)}">grade: ${escapeHtml(answer.grade_status || "pending")}</span>
          </span>
        </div>
        <p>${escapeHtml(answer.question_text)}</p>
        ${answer.followup_text ? `<p class="muted"><strong>Follow-up:</strong> ${escapeHtml(answer.followup_text)}</p>` : ""}
        ${submission.slug === "operations-dev" && OPS_COVERS[answer.question_index] ? `<p class="cover"><strong>Reviewer note — expected points:</strong> ${escapeHtml(OPS_COVERS[answer.question_index])}</p>` : ""}
        ${mediaTag(answer.file_url, answer.mime_type)}
        <a href="${escapeHtml(answer.file_url)}" target="_blank" rel="noopener">Open recording</a>
        ${transcriptBlock}
        ${gradeBlock}
        <div class="answer-actions">
          <button class="ghost small" data-retranscribe="${escapeHtml(answer.id)}" type="button">Re-transcribe</button>
        </div>
      </section>
    `;
  }).join("");

  els.detail.innerHTML = `
    <header class="detail-header">
      <div>
        <h2>${escapeHtml(submission.candidate_name)}</h2>
        <p>${escapeHtml(submission.candidate_email || "No candidate email")} · ${escapeHtml(submission.role)}</p>
      </div>
      <span class="${statusClass(submission.email_status)}">${escapeHtml(submission.email_status || "pending")}</span>
    </header>

    <div class="detail-actions">
      <button class="ghost small" id="transcribeAllBtn" type="button">Transcribe missing</button>
      <button class="ghost small" id="forceTranscribeAllBtn" type="button">Force re-transcribe all</button>
    </div>

    <div class="stats">
      ${stat("Submitted", fmtDate(submission.created_at))}
      ${stat("Track", `${submission.role || "—"}${submission.slug ? ` (${submission.slug})` : ""}`)}
      ${stat("Status", submission.status)}
      ${stat("Questions", answers.length)}
      ${stat("Transcribed", `${transcribed}/${answers.length}`)}
      ${stat("Avg score", avg !== null ? `${avg}/100` : "—")}
      ${stat("Stopped at", submission.current_question ? `Question ${submission.current_question}` : "—")}
      ${stat("Last seen", fmtDate(submission.last_seen_at))}
      ${stat("Tab switches", submission.visibility_hidden_count)}
      ${stat("Speed", submission.speed_rating || "Not tested")}
    </div>

    ${submission.email_error ? `<div class="notice"><strong>Email error:</strong> ${escapeHtml(submission.email_error)}</div>` : ""}
    ${submission.email_message_id ? `<div class="notice ok"><strong>Email message id:</strong> ${escapeHtml(submission.email_message_id)}</div>` : ""}

    ${practice}
    <section>
      <h3>Interview Recordings</h3>
      ${answerHtml || `<p class="muted">No recordings have been uploaded for this submission.</p>`}
    </section>
  `;
  els.emptyState.classList.add("hidden");
  els.detail.classList.remove("hidden");
}

let detailPollTimer = null;
let detailPollUntil = 0;

function scheduleDetailRefresh() {
  clearTimeout(detailPollTimer);
  if (Date.now() > detailPollUntil || !selectedId) return;
  detailPollTimer = setTimeout(async () => {
    if (!selectedId) return;
    try {
      const data = await api(`/api/admin/submissions/${encodeURIComponent(selectedId)}`);
      const answers = data.submission.answers || [];
      if (selectedId) renderDetail(data.submission);
      const active =
        answers.some((a) => ["transcribing", "grading"].includes(a.transcript_status) || ["grading"].includes(a.grade_status)) ||
        (await api("/api/admin/session").then((s) => (s.queue || 0) > 0).catch(() => false));
      if (active && Date.now() < detailPollUntil) scheduleDetailRefresh();
    } catch {}
  }, 5000);
}

async function selectSubmission(id) {
  selectedId = id;
  clearTimeout(detailPollTimer);
  detailPollUntil = 0;
  renderList();
  els.detail.innerHTML = `<div class="empty-state">Loading submission...</div>`;
  els.emptyState.classList.add("hidden");
  els.detail.classList.remove("hidden");
  const data = await api(`/api/admin/submissions/${encodeURIComponent(id)}`);
  renderDetail(data.submission);
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: els.password.value }),
    });
    els.password.value = "";
    showAdmin();
    await loadSubmissions();
  } catch (error) {
    els.loginError.textContent = error.message;
  }
});

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => {});
  selectedId = null;
  submissions = [];
  showLogin();
});

els.refreshBtn.addEventListener("click", () => {
  loadSubmissions().catch((error) => {
    els.summary.textContent = error.message;
  });
});

els.searchInput.addEventListener("input", () => {
  clearTimeout(els.searchInput._timer);
  els.searchInput._timer = setTimeout(() => {
    loadSubmissions().catch((error) => {
      els.summary.textContent = error.message;
    });
  }, 250);
});

els.list.addEventListener("click", (event) => {
  const row = event.target.closest("[data-id]");
  if (row) {
    selectSubmission(row.dataset.id).catch((error) => {
      els.detail.innerHTML = `<div class="notice">${escapeHtml(error.message)}</div>`;
    });
  }
});

els.detail.addEventListener("click", async (event) => {
  const retryBtn = event.target.closest("[data-retranscribe]");
  if (retryBtn) {
    retryBtn.disabled = true;
    retryBtn.textContent = "Queued…";
    try {
      await api(`/api/admin/answers/${encodeURIComponent(retryBtn.dataset.retranscribe)}/transcribe`, {
        method: "POST",
        body: "{}",
      });
      detailPollUntil = Date.now() + 180000;
      scheduleDetailRefresh();
    } catch (error) {
      retryBtn.textContent = "Retry failed";
      retryBtn.title = error.message;
    }
    return;
  }

  const isTranscribeAll = event.target.id === "transcribeAllBtn";
  const isForce = event.target.id === "forceTranscribeAllBtn";
  if ((isTranscribeAll || isForce) && selectedId) {
    if (isForce && !confirm("Re-transcribe and re-grade every answer in this submission?")) return;
    const btn = event.target;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Queueing…";
    try {
      const data = await api(
        `/api/admin/submissions/${encodeURIComponent(selectedId)}/transcribe${isForce ? "?force=1" : ""}`,
        { method: "POST", body: "{}" }
      );
      btn.textContent = data.queued ? `Queued ${data.queued}` : "Nothing to do";
      detailPollUntil = Date.now() + 180000;
      scheduleDetailRefresh();
    } catch (error) {
      btn.textContent = label;
      btn.disabled = false;
      alert(error.message);
    }
  }
});

api("/api/admin/session")
  .then(async (data) => {
    if (data.authenticated) {
      showAdmin();
      await loadSubmissions();
    } else {
      showLogin();
    }
  })
  .catch(() => showLogin());
