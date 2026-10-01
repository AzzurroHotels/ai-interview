// -------------------------------
// Operations (Developer) interview configuration
// -------------------------------
const CONFIG = {
  slug: "operations-dev",
  role: "Operations (Developer)",
  mode: "audio",
  aiVoiceEnabled: true,
  aiVoiceRate: 1.15,
  aiVoicePitch: 1.0,
  // Audio-only recording formats
  preferredMimeTypes: [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ],
};

// Final question list (cover notes live in the admin panel, not shown to candidates)
const QUESTIONS = [
  {
    id: "ops-1-notion-questions",
    text: "Have you gone through the full Notion? What questions do you have about the business, and what are you curious about?",
  },
  {
    id: "ops-2-business-flow",
    text: "Can you summarize how the business operates, especially operations? Who would you be working alongside, and who owns each task?",
  },
  {
    id: "ops-3-cleaning-investment",
    text: "Why do you think we invest so much time and effort into cleaning and maintenance? How does that connect to our business outcomes?",
  },
  {
    id: "ops-4-improvements",
    text: "After going through our operations structure, what do you think can be improved? Do you have any suggestions to save us time or money?",
  },
  {
    id: "ops-5-maintenance",
    text: "How do maintenance issues get resolved?",
  },
  {
    id: "ops-6-receptionist-assessment",
    text: "How do we assess receptionists? What should we be evaluating them on?",
  },
  {
    id: "ops-7-more-context",
    text: "What do you think you need more context on to get on top of all the tasks and work better?",
  },
  {
    id: "ops-8-guest-channels",
    text: "Where do receptionists communicate with guests?",
  },
];

// -------------------------------
// UI elements
// -------------------------------
const els = {
  status: document.getElementById("statusText"),

  welcome: document.getElementById("step-welcome"),
  interview: document.getElementById("step-interview"),
  done: document.getElementById("step-done"),

  consent: document.getElementById("consent"),
  fullName: document.getElementById("fullName"),
  startBtn: document.getElementById("startBtn"),

  micDot: document.getElementById("micDot"),
  micStatus: document.getElementById("micStatus"),

  tabWarning: document.getElementById("tabWarning"),
  qList: document.getElementById("qList"),

  qBadge: document.getElementById("qBadge"),
  qProgress: document.getElementById("qProgress"),
  question: document.getElementById("question"),
  aiText: document.getElementById("aiText"),
  hintText: document.getElementById("hintText"),

  startAnswerBtn: document.getElementById("startAnswerBtn"),
  stopAnswerBtn: document.getElementById("stopAnswerBtn"),
  retrySaveBtn: document.getElementById("retrySaveBtn"),
  nextBtn: document.getElementById("nextBtn"),

  saveState: document.getElementById("saveState"),
  playbackWrap: document.getElementById("playbackWrap"),
  playback: document.getElementById("playback"),
  playbackMeta: document.getElementById("playbackMeta"),
};

function setStatus(text) {
  els.status.textContent = text;
}

function showStep(stepEl) {
  for (const el of [els.welcome, els.interview, els.done]) el.classList.add("hidden");
  stepEl.classList.remove("hidden");
}

function safeName(s) {
  return (s || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let num = bytes;
  while (num >= 1024 && i < units.length - 1) {
    num /= 1024;
    i++;
  }
  return `${num.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// -------------------------------
// AI voice (Web Speech API)
// -------------------------------
function speak(text, onDone) {
  const finish = () => onDone && onDone();
  if (!CONFIG.aiVoiceEnabled || !("speechSynthesis" in window)) return finish();

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = CONFIG.aiVoiceRate;
  utter.pitch = CONFIG.aiVoicePitch;

  const voices = window.speechSynthesis.getVoices?.() || [];
  const preferred = voices.find((v) => /en/i.test(v.lang)) || voices[0];
  if (preferred) utter.voice = preferred;

  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    finish();
  };
  utter.onend = once;
  utter.onerror = once;
  window.speechSynthesis.speak(utter);

  // Safety net if onend never fires
  setTimeout(once, Math.min(60000, 4000 + text.length * 100));
}

// -------------------------------
// Audio-only recording
// -------------------------------
function pickMimeType() {
  for (const t of CONFIG.preferredMimeTypes) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function hasRecordingSupport() {
  return typeof window.MediaRecorder !== "undefined";
}

class AudioRecorder {
  constructor(stream) {
    this.stream = stream;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    this.mimeType = pickMimeType();
  }

  start() {
    this.chunks = [];
    this.startedAt = performance.now();
    this.recorder = new MediaRecorder(
      this.stream,
      this.mimeType ? { mimeType: this.mimeType } : undefined
    );
    this.recorder.onerror = (e) => console.error("MediaRecorder error", e);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(200);
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject(new Error("Recorder not started"));
      this.recorder.onstop = () => {
        const durationSeconds = Math.max(1, Math.round((performance.now() - this.startedAt) / 1000));
        const mimeType = this.recorder.mimeType || "audio/webm";
        resolve({ blob: new Blob(this.chunks, { type: mimeType }), durationSeconds, mimeType });
      };
      this.recorder.stop();
    });
  }
}

// -------------------------------
// State
// -------------------------------
let stream = null;
let recorder = null;
let currentClip = null;
let answerSaved = false;
let currentIdx = 0;
let interviewId = null;
let finished = false;
let heartbeatTimer = null;
let warnTimer = null;
let tabSwitches = 0;
let pendingWarning = false;

// -------------------------------
// Tab-switch tracking
// -------------------------------
document.addEventListener("visibilitychange", () => {
  if (!interviewId || finished) return;
  if (document.hidden) {
    tabSwitches += 1;
    pendingWarning = true;
  } else if (pendingWarning) {
    pendingWarning = false;
    showTabWarning();
    heartbeat();
  }
});

function showTabWarning() {
  els.tabWarning.textContent = `Tab switch detected (${tabSwitches}). This is recorded and shown to the team.`;
  els.tabWarning.classList.add("show");
  clearTimeout(warnTimer);
  warnTimer = setTimeout(() => els.tabWarning.classList.remove("show"), 10000);
}

// -------------------------------
// Abandon tracking
// -------------------------------
function sendAbandonBeacon() {
  if (!interviewId || finished) return;
  try {
    navigator.sendBeacon(`/api/interviews/${interviewId}/abandon`);
  } catch {}
}
window.addEventListener("pagehide", sendAbandonBeacon);
window.addEventListener("beforeunload", sendAbandonBeacon);

// -------------------------------
// Heartbeat (abandoned detection)
// -------------------------------
function heartbeat() {
  if (!interviewId || finished) return;
  fetch(`/api/interviews/${interviewId}/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      current_question: currentIdx + 1,
      visibility_hidden_count: tabSwitches,
    }),
  }).catch(() => {});
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 15000);
}

// -------------------------------
// Question list sidebar
// -------------------------------
function renderQList() {
  els.qList.innerHTML = "";
  QUESTIONS.forEach((q, i) => {
    const li = document.createElement("li");
    li.textContent = `Q${i + 1}. ${q.text.length > 68 ? q.text.slice(0, 68).trim() + "…" : q.text}`;
    li.id = `qlist-${i}`;
    els.qList.appendChild(li);
  });
}

function markQList() {
  QUESTIONS.forEach((_, i) => {
    const li = document.getElementById(`qlist-${i}`);
    if (!li) return;
    li.classList.toggle("done", i < currentIdx);
    li.classList.toggle("active", i === currentIdx);
  });
}

// -------------------------------
// Start
// -------------------------------
els.startBtn.addEventListener("click", async () => {
  if (!els.consent.checked) {
    alert("Consent is required to proceed.");
    return;
  }
  const name = safeName(els.fullName.value);
  if (!name) {
    alert("Please enter your full name.");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Your browser does not support microphone recording. Please use the latest Chrome, Edge, or Safari.");
    return;
  }
  if (!hasRecordingSupport()) {
    alert("Your browser does not support in-browser recording (MediaRecorder). Please use the latest Chrome or Edge.");
    return;
  }

  try {
    setStatus("Requesting microphone…");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    els.micDot.classList.add("live");
    els.micStatus.textContent = "Microphone active";
    setStatus("Microphone ready");
  } catch (e) {
    console.error(e);
    setStatus("Microphone blocked");
    alert("Microphone permission is required for this interview.");
    return;
  }

  try {
    setStatus("Starting…");
    const createRes = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_name: name,
        candidate_email: null,
        role: CONFIG.role,
        slug: CONFIG.slug,
        mode: CONFIG.mode,
        status: "in_progress",
        total_questions: QUESTIONS.length,
        current_question: 1,
        user_agent: navigator.userAgent || "",
        device_hint: /Mobi|Android/i.test(navigator.userAgent || "") ? "mobile" : "desktop",
        visibility_hidden_count: 0,
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error || "Could not start the interview");
    }
    const interview = await createRes.json();
    interviewId = interview.id;
  } catch (e) {
    console.error(e);
    setStatus("Start failed");
    alert("Could not start the interview. Please check your connection and try again.");
    try {
      stream?.getTracks?.().forEach((t) => t.stop());
    } catch {}
    stream = null;
    return;
  }

  startHeartbeat();
  currentIdx = 0;
  renderQList();
  showStep(els.interview);
  loadQuestion();
});

// -------------------------------
// Question flow
// -------------------------------
function loadQuestion() {
  const total = QUESTIONS.length;
  const item = QUESTIONS[currentIdx];

  answerSaved = false;
  currentClip = null;

  els.qBadge.textContent = `Question ${currentIdx + 1}`;
  els.qProgress.textContent = `${currentIdx + 1} of ${total}`;
  els.question.textContent = item.text;

  els.startAnswerBtn.disabled = true;
  els.startAnswerBtn.classList.remove("hidden");
  els.stopAnswerBtn.disabled = true;
  els.retrySaveBtn.classList.add("hidden");
  els.nextBtn.disabled = true;
  els.nextBtn.textContent = currentIdx === total - 1 ? "Finish & Submit →" : "Next Question →";
  els.saveState.textContent = "";
  els.saveState.className = "saveState";
  els.playbackWrap.classList.add("hidden");
  els.playback.removeAttribute("src");
  els.playbackMeta.textContent = "";
  els.micDot.classList.remove("live");

  markQList();
  heartbeat();
  setStatus(`Question ${currentIdx + 1} of ${total}`);

  const voiceText = `Question ${currentIdx + 1}. ${item.text}`;
  els.aiText.textContent = `"${voiceText}"`;
  els.hintText.textContent = "The AI is reading the question — listen, then take your time before answering.";
  els.startAnswerBtn.textContent = "Start Answer";

  speak(voiceText, () => {
    els.startAnswerBtn.disabled = false;
    els.hintText.textContent = "One take only. When you’re ready, press Start Answer.";
  });
}

els.startAnswerBtn.addEventListener("click", () => {
  if (!stream || !interviewId) return;
  try {
    window.speechSynthesis?.cancel();
  } catch {}

  recorder = new AudioRecorder(stream);
  recorder.start();

  els.startAnswerBtn.disabled = true;
  els.stopAnswerBtn.disabled = false;
  els.micDot.classList.add("live");
  els.hintText.textContent = "Recording — press Stop & Save when you’ve finished. Do not refresh or close this tab.";
  setStatus("Recording…");
});

els.stopAnswerBtn.addEventListener("click", async () => {
  if (!recorder) return;
  els.stopAnswerBtn.disabled = true;
  els.micDot.classList.remove("live");

  try {
    currentClip = await recorder.stop();
  } catch (e) {
    console.error(e);
    els.saveState.textContent = "Recording failed. Please try again.";
    els.saveState.className = "saveState err";
    els.startAnswerBtn.disabled = false;
    return;
  }

  await saveAnswer();
});

async function saveAnswer() {
  if (!currentClip || !interviewId) return;
  const i = currentIdx;

  els.saveState.textContent = "Saving answer…";
  els.saveState.className = "saveState";
  els.retrySaveBtn.classList.add("hidden");
  els.nextBtn.disabled = true;
  setStatus("Saving…");

  const ext = currentClip.mimeType.includes("mp4") ? "mp4" : "webm";
  const formData = new FormData();
  formData.append("file", currentClip.blob, `q${i + 1}.${ext}`);
  formData.append("interviewId", interviewId);
  formData.append("type", "question");
  formData.append("questionIndex", i + 1);
  formData.append("questionId", QUESTIONS[i].id);
  formData.append("questionText", QUESTIONS[i].text);
  formData.append("followupText", "");
  formData.append("mimeType", currentClip.mimeType);
  formData.append("durationSeconds", currentClip.durationSeconds);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed (${res.status})`);
    }

    answerSaved = true;
    els.saveState.textContent = "Answer saved ✓";
    els.saveState.className = "saveState ok";
    els.startAnswerBtn.classList.add("hidden");
    els.nextBtn.disabled = false;

    const url = URL.createObjectURL(currentClip.blob);
    els.playback.src = url;
    els.playbackWrap.classList.remove("hidden");
    els.playbackMeta.textContent = `Duration: ~${currentClip.durationSeconds}s • Size: ${formatBytes(currentClip.blob.size)}`;

    els.hintText.textContent = "Review your answer above if you like — when you’re ready, continue.";
    markQList();
    setStatus("Saved");
    heartbeat();
  } catch (e) {
    console.error(e);
    answerSaved = false;
    els.saveState.textContent = `Could not save: ${e.message}. Check your connection and press Retry Save.`;
    els.saveState.className = "saveState err";
    els.retrySaveBtn.classList.remove("hidden");
    setStatus("Save failed");
  }
}

els.retrySaveBtn.addEventListener("click", () => {
  if (currentClip) saveAnswer();
});

els.nextBtn.addEventListener("click", () => {
  if (!answerSaved) return;
  if (currentIdx >= QUESTIONS.length - 1) {
    finishInterview();
  } else {
    currentIdx += 1;
    loadQuestion();
  }
});

// -------------------------------
// Finish: mark submitted + notify careers@
// -------------------------------
async function finishInterview() {
  setStatus("Submitting…");
  els.nextBtn.disabled = true;

  const payload = JSON.stringify({
    status: "submitted",
    visibility_hidden_count: tabSwitches,
    current_question: QUESTIONS.length,
  });

  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    try {
      const res = await fetch(`/api/interviews/${interviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      saved = res.ok;
    } catch {}
    if (!saved) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }

  finished = true;
  clearInterval(heartbeatTimer);

  try {
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interview_id: interviewId }),
    });
  } catch {}

  try {
    stream?.getTracks?.().forEach((t) => t.stop());
  } catch {}

  els.micDot.classList.remove("live");
  els.micStatus.textContent = "Microphone released";
  setStatus("Submitted");
  showStep(els.done);
}
