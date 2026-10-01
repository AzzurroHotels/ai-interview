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
  els.summary.textContent = `${total} submissions. ${sent} emails sent. ${failed} email failures.`;

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
        <span class="${statusClass(item.email_status)}">${escapeHtml(item.email_status || "pending")}</span>
        <span>${fmtDate(item.created_at)}</span>
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

function renderDetail(submission) {
  const answers = submission.answers || [];
  const practice = submission.practice_url ? `
    <section>
      <h3>Practice Recording</h3>
      <video controls preload="metadata" src="${escapeHtml(submission.practice_url)}"></video>
    </section>
  ` : "";

  const answerHtml = answers.map((answer) => `
    <section class="answer">
      <h3>Question ${escapeHtml(answer.question_index)}</h3>
      <p>${escapeHtml(answer.question_text)}</p>
      ${answer.followup_text ? `<p class="muted"><strong>Follow-up:</strong> ${escapeHtml(answer.followup_text)}</p>` : ""}
      <video controls preload="metadata" src="${escapeHtml(answer.file_url)}"></video>
      <a href="${escapeHtml(answer.file_url)}" target="_blank" rel="noopener">Open recording</a>
    </section>
  `).join("");

  els.detail.innerHTML = `
    <header class="detail-header">
      <div>
        <h2>${escapeHtml(submission.candidate_name)}</h2>
        <p>${escapeHtml(submission.candidate_email || "No candidate email")} · ${escapeHtml(submission.role)}</p>
      </div>
      <span class="${statusClass(submission.email_status)}">${escapeHtml(submission.email_status || "pending")}</span>
    </header>

    <div class="stats">
      ${stat("Submitted", fmtDate(submission.created_at))}
      ${stat("Status", submission.status)}
      ${stat("Questions", answers.length)}
      ${stat("Device", submission.device_hint)}
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

async function selectSubmission(id) {
  selectedId = id;
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
