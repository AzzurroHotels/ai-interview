import { SUPABASE_URL, SUPABASE_ANON_KEY, CAREERS_EMAIL } from "./supabase-config.js";

// -------------------------------
// Runtime guards (reduce "blank page" failures)
// -------------------------------
if (!window.supabase?.createClient) {
  throw new Error(
    "Supabase JS SDK not loaded. Ensure <script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script> is included before app.js."
  );
}

function looksUnconfigured(v) {
  return !v || /YOUR_PROJECT_REF|YOUR_SUPABASE_ANON_KEY/i.test(String(v));
}

if (looksUnconfigured(SUPABASE_URL) || looksUnconfigured(SUPABASE_ANON_KEY)) {
  // Show a helpful message on-screen (instead of failing silently)
  const msg =
    "Supabase is not configured yet. Please update supabase-config.js with your SUPABASE_URL and SUPABASE_ANON_KEY.";
  console.error(msg);
  alert(msg);
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -------------------------------
// Interview configuration
// -------------------------------
const CONFIG = {
  role: "Remote Hotel Receptionist",
  mode: "video", // fixed for this project
  // No re-records allowed - one take only
  aiVoiceEnabled: true,
  aiVoiceRate: 1.50,
  aiVoicePitch: 1.0,
  // Follow-ups: choose 1 random follow-up per main question
  followupsPerQuestion: 1,
  // Recording format
  preferredMimeTypes: [
    // Safari/iOS often prefers MP4 (when MediaRecorder is available)
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ],
};

// -------------------------------
// Question bank (your provided questions + follow-ups)
// Random order of main questions; one random follow-up each
// -------------------------------
const QUESTIONS = [
  {
    id: "q1-difficult-clients",
    text: "With all your experiences, how do you handle difficult clients or angry customers/callers?",
    followups: [
      "What’s your step-by-step approach when someone is already shouting or emotional?",
      "Tell me about a time you handled a difficult customer from start to finish. What happened and what did you do?",
      "How do you ensure customer satisfaction when something goes wrong?",
      "If you don’t know the answer right away, what do you do while the customer is waiting?",
      "How do you communicate with customers who are emotional or distressed?",
    ],
  },
  {
    id: "q2-say-no",
    text: "Can you describe a situation where you had to say “no” to a customer? How did you manage their reaction?",
    followups: [
      "What exact words did you use to say “no” without escalating the situation?",
      "How do you offer alternatives when the original request isn’t possible?",
      "If the customer insists or threatens to complain, what would you do next?",
      "How do you keep the conversation professional while still being helpful?",
    ],
  },
  {
    id: "q3-feedback",
    text: "How do you respond to feedback? And is there one piece of feedback that’s stuck with you throughout your career?",
    followups: [
      "Tell me about a time you received corrective feedback. What changed after that?",
      "How do you handle feedback when you don’t fully agree with it?",
      "How do you make sure the improvement is consistent, not just for a few days?",
      "What do you do when you realize you made a mistake at work?",
    ],
  },
  {
    id: "q4-prioritize",
    text: "How do you prioritize tasks when everything feels urgent?",
    followups: [
      "Walk me through how you decide what to do first in a busy shift.",
      "How do you handle multitasking in a fast-paced environment without missing details?",
      "What tools or methods do you use to stay organized?",
      "Can you share an example where you had multiple urgent tasks at once? What did you do?",
      "How do you balance speed vs accuracy?",
    ],
  },
];

// -------------------------------
// UI elements
// -------------------------------
const els = {
  status: document.getElementById("statusText"),

  // steps
  welcome: document.getElementById("step-welcome"),
  speedtest: document.getElementById("step-speedtest"),
  practice: document.getElementById("step-practice"),
  interview: document.getElementById("step-interview"),
  submit: document.getElementById("step-submit"),
  done: document.getElementById("step-done"),

  // inputs
  consent: document.getElementById("consent"),
  fullName: document.getElementById("fullName"),
  email: document.getElementById("email"),
  startBtn: document.getElementById("startBtn"),

  // camera
  preview: document.getElementById("preview"),

  // practice
  practiceRecordBtn: document.getElementById("practiceRecordBtn"),
  practiceStopBtn: document.getElementById("practiceStopBtn"),
  practiceContinueBtn: document.getElementById("practiceContinueBtn"),
  practicePlaybackWrap: document.getElementById("practicePlaybackWrap"),
  practicePlayback: document.getElementById("practicePlayback"),
  aiTextPractice: document.getElementById("aiTextPractice"),
  practiceQuestion: document.getElementById("practiceQuestion"),

  // interview Qs
  qBadge: document.getElementById("qBadge"),
  qProgress: document.getElementById("qProgress"),
  question: document.getElementById("question"),
  followup: document.getElementById("followup"),
  aiText: document.getElementById("aiText"),
  hintText: document.getElementById("hintText"),

  // interview controls
  recordBtn: document.getElementById("recordBtn"),
  stopBtn: document.getElementById("stopBtn"),
  nextBtn: document.getElementById("nextBtn"),
  playbackWrap: document.getElementById("playbackWrap"),
  playback: document.getElementById("playback"),
  playbackMeta: document.getElementById("playbackMeta"),

  // upload progress
  uploadBar: document.getElementById("uploadBar"),
  uploadStatus: document.getElementById("uploadStatus"),
};

function setStatus(text) {
  els.status.textContent = text;
}

function showStep(stepEl) {
  for (const el of [els.welcome, els.speedtest, els.practice, els.interview, els.submit, els.done]) {
    el.classList.add("hidden");
  }
  stepEl.classList.remove("hidden");
}

// -------------------------------
// Basic helpers
// -------------------------------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr, n) {
  const s = shuffle(arr);
  return s.slice(0, Math.max(0, Math.min(n, s.length)));
}

function nowIso() {
  return new Date().toISOString();
}

function safeName(s) {
  return (s || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function safeEmail(s) {
  const v = (s || "").trim().slice(0, 254);
  return v;
}

function isProbablyEmail(s) {
  // Simple sanity check (not RFC-perfect; prevents obvious bad input)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

// -------------------------------
// AI voice (Web Speech API) - built-in browser TTS
// -------------------------------
function speak(text) {
  if (!CONFIG.aiVoiceEnabled) return;
  if (!("speechSynthesis" in window)) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = CONFIG.aiVoiceRate;
  utter.pitch = CONFIG.aiVoicePitch;

  // Prefer an English voice if available
  const voices = window.speechSynthesis.getVoices?.() || [];
  const preferred = voices.find(v => /en/i.test(v.lang)) || voices[0];
  if (preferred) utter.voice = preferred;

  window.speechSynthesis.speak(utter);
}

// Some browsers load voices asynchronously
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// -------------------------------
// Media recording
// -------------------------------
function pickMimeType() {
  for (const t of CONFIG.preferredMimeTypes) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

async function getCameraStream() {
  return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
}

function hasRecordingSupport() {
  return typeof window.MediaRecorder !== "undefined";
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

class ClipRecorder {
  constructor(stream) {
    this.stream = stream;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    this.stoppedAt = null;
    this.mimeType = pickMimeType();
  }

  start() {
    this.chunks = [];
    this.startedAt = performance.now();

    this.recorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.recorder.onerror = (e) => {
      console.error("MediaRecorder error", e);
    };
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(200); // collect chunks periodically
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject(new Error("Recorder not started"));
      this.recorder.onstop = () => {
        this.stoppedAt = performance.now();
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType || "video/webm" });
        const durationSeconds = Math.max(1, Math.round((this.stoppedAt - this.startedAt) / 1000));
        resolve({ blob, durationSeconds, mimeType: this.recorder.mimeType || "video/webm" });
      };
      this.recorder.stop();
    });
  }
}

// -------------------------------
// Interview state
// -------------------------------
let stream = null;

let practiceClip = null; // { blob, durationSeconds, mimeType }
let practiceRerecords = 0;

let interviewPlan = []; // [{question, followupText, index}]
let currentIdx = 0;

let currentClip = null; // { blob, durationSeconds, mimeType }
let recordedClips = []; // for upload [{question_id, question_text, followup_text, blob, duration_seconds, mime_type}]

let visibilityHiddenCount = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) visibilityHiddenCount += 1;
});

// -------------------------------
// UI wiring
// -------------------------------
els.startBtn.addEventListener("click", async () => {
  // Validate
  if (!els.consent.checked) {
    alert("Consent is required to proceed.");
    return;
  }
  const name = safeName(els.fullName.value);
  if (!name) {
    alert("Please enter your full name.");
    return;
  }
  const email = safeEmail(els.email.value);
  if (email && !isProbablyEmail(email)) {
    alert("Please enter a valid email address (or leave it blank).");
    return;
  }

  // Camera
  try {
    setStatus("Requesting camera…");
    stream = await getCameraStream();
    els.preview.srcObject = stream;
    setStatus("Camera ready");
  } catch (e) {
    console.error(e);
    setStatus("Camera blocked");
    alert("Camera/Mic permission is required for this interview.");
    return;
  }

  // Recording support
  if (!hasRecordingSupport()) {
    setStatus("Recording unsupported");
    alert(
      "Your browser does not support in-browser recording (MediaRecorder). Please use the latest Chrome or Edge on desktop, or the latest Chrome on Android.\n\nIf you're on iPhone/iPad, update iOS and try again, or use a desktop browser."
    );
    try {
      stream?.getTracks?.().forEach((t) => t.stop());
    } catch {}
    stream = null;
    return;
  }

  // Move to speed test first
  showStep(els.speedtest);
  speak("Before we start, we’ll run a quick internet speed test to ensure a smooth interview experience.");
  runSpeedTest();
});

// -------------------------------
// Internet Speed Test
// -------------------------------
let speedTestResults = null;

function getSpeedTestBase() {
  return SUPABASE_URL + "/functions/v1/speed-test";
}

async function measurePing() {
  // Direct browser ping to Google (Manila PoP) — single hop, no CORS issues
  const endpoints = [
    "https://www.google.com/generate_204",
    "https://www.gstatic.com/generate_204",
  ];
  const samples = [];
  for (let i = 0; i < 8; i++) {
    const url = endpoints[i % endpoints.length] + "?_=" + (Date.now() + i);
    const t0 = performance.now();
    await fetch(url, { mode: "no-cors", cache: "no-store" }).catch(() => {});
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const trimmed = samples.slice(1, -2);
  return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
}

async function measureDownload() {
  const base = getSpeedTestBase();
  const res = await fetch(`${base}?action=download&_=${Date.now()}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY,
    },
  });
  const data = await res.json();
  if (!data.ok) throw new Error("Download test failed: " + (data.error || "unknown"));
  return data.download_mbps;
}

async function measureUpload() {
  const base = getSpeedTestBase();
  const size = 2 * 1024 * 1024;
  const payload = new Uint8Array(size);
  crypto.getRandomValues(payload.subarray(0, 4096));

  const res = await fetch(`${base}?action=upload`, {
    method: "POST",
    body: payload,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/octet-stream",
    },
  });
  const data = await res.json();
  if (!data.ok) throw new Error("Upload test failed: " + (data.error || "unknown"));
  return data.upload_mbps;
}

function speedRating(ping, down, up) {
  if (down >= 5  && up >= 1   && ping <= 120) return { label: "Excellent", color: "#16a34a", bg: "rgba(22,163,74,0.08)",   border: "rgba(22,163,74,0.25)" };
  if (down >= 2  && up >= 0.5 && ping <= 250) return { label: "Good",      color: "#1d8bff", bg: "rgba(29,139,255,0.07)", border: "rgba(29,139,255,0.18)" };
  if (down >= 1  && up >= 0.3)                return { label: "Fair",      color: "#92400e", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.35)" };
  return                                              { label: "Poor",       color: "#b91c1c", bg: "rgba(220,38,38,0.07)",  border: "rgba(220,38,38,0.25)" };
}

async function runSpeedTest() {
  const stBar       = document.getElementById("speedTestBar");
  const stStatus    = document.getElementById("speedTestStatus");
  const stProgress  = document.getElementById("speedTestProgress");
  const stPing      = document.getElementById("stPing");
  const stDown      = document.getElementById("stDown");
  const stUp        = document.getElementById("stUp");
  const stRating    = document.getElementById("speedTestRating");
  const continueBtn = document.getElementById("speedTestContinueBtn");

  const setBar = (pct) => { stBar.style.width = `${pct}%`; };
  const setMsg = (msg)  => { stStatus.textContent = msg; };

  let ping = null, down = null, up = null;

  // Measure each independently so partial results are always saved
  try {
    stProgress.textContent = "Measuring ping...";
    setMsg("Measuring ping...");
    setBar(10);
    ping = await measurePing();
    stPing.textContent = ping;
    console.log("Ping:", ping);
  } catch (e) {
    console.error("Ping failed:", e?.message || e);
    stPing.textContent = "—";
  }
  setBar(33);

  try {
    stProgress.textContent = "Measuring download speed...";
    setMsg("Measuring download speed...");
    down = await measureDownload();
    stDown.textContent = down;
    console.log("Download:", down);
  } catch (e) {
    console.error("Download failed:", e?.message || e);
    stDown.textContent = "—";
    setMsg("Download test failed: " + (e?.message || e));
  }
  setBar(66);

  try {
    stProgress.textContent = "Measuring upload speed...";
    setMsg("Measuring upload speed...");
    up = await measureUpload();
    stUp.textContent = up;
    console.log("Upload:", up);
  } catch (e) {
    console.error("Upload failed:", e?.message || e);
    stUp.textContent = "—";
    setMsg("Upload test failed: " + (e?.message || e));
  }
  setBar(100);

  // Always save whatever we got — even partial
  const ratingLabel = (down !== null && up !== null && ping !== null)
    ? speedRating(ping, down, up).label
    : "Partial";

  speedTestResults = {
    ping_ms: ping,
    download_mbps: down,
    upload_mbps: up,
    rating: ratingLabel,
  };

  console.log("speedTestResults saved:", JSON.stringify(speedTestResults));

  if (down !== null && up !== null && ping !== null) {
    const rating = speedRating(ping, down, up);
    stRating.textContent = "Connection quality: " + rating.label;
    stRating.style.cssText = "background:" + rating.bg + ";border:1px solid " + rating.border + ";color:" + rating.color + ";padding:12px 14px;border-radius:10px;font-size:14px;font-weight:700;margin-top:12px;display:block;";
    stRating.classList.remove("hidden");
    stProgress.textContent = "Done";
    setMsg("Speed test complete.");
  } else {
    stProgress.textContent = "Partial results";
    setMsg("Some tests could not complete. Partial results saved.");
  }

  continueBtn.disabled = false;
}

document.getElementById("speedTestContinueBtn").addEventListener("click", () => {
  showStep(els.practice);
  speak(“Let’s do a quick practice. This is not scored. Please say your name and today’s date, and give a warm greeting as if answering a hotel call.”);
});

// Practice controls
let practiceRecorder = null;
els.practiceRecordBtn.addEventListener("click", () => {
  if (!stream) return;

  practiceRecorder = new ClipRecorder(stream);
  practiceRecorder.start();

  els.practiceRecordBtn.disabled = true;
  els.practiceStopBtn.disabled = false;

  els.practiceContinueBtn.disabled = true;

  setStatus("Recording practice…");
});

els.practiceStopBtn.addEventListener("click", async () => {
  if (!practiceRecorder) return;
  let clip;
  try {
    clip = await practiceRecorder.stop();
  } catch (e) {
    console.error(e);
    setStatus("Practice stop failed");
    alert("Recording failed. Please try again.");
    els.practiceRecordBtn.disabled = false;
    els.practiceStopBtn.disabled = true;
  
    els.practiceContinueBtn.disabled = true;
    return;
  }

  practiceClip = clip;

  const url = URL.createObjectURL(clip.blob);
  els.practicePlayback.src = url;
  els.practicePlaybackWrap.classList.remove("hidden");

  els.practiceStopBtn.disabled = true;
  els.practiceRecordBtn.disabled = true;
  els.practiceContinueBtn.disabled = false;

  setStatus("Practice recorded");
});

// Practice retry button removed - no retakes allowed

els.practiceContinueBtn.addEventListener("click", () => {
  // Build interview plan: shuffle main questions; pick 1 follow-up each
  const mains = shuffle(QUESTIONS);
  interviewPlan = mains.map((q, i) => {
    const followup = pickRandom(q.followups, CONFIG.followupsPerQuestion)[0] || null;
    return { index: i, question: q, followupText: followup };
  });
  currentIdx = 0;
  recordedClips = [];

  showStep(els.interview);
  loadQuestion();
});

function loadQuestion() {
  const total = interviewPlan.length;
  const item = interviewPlan[currentIdx];

  els.qBadge.textContent = `Question ${currentIdx + 1}`;
  els.qProgress.textContent = `${currentIdx + 1} of ${total}`;
  els.question.textContent = item.question.text;

  if (item.followupText) {
    els.followup.textContent = item.followupText;
    els.followup.classList.remove("hidden");
  } else {
    els.followup.classList.add("hidden");
  }

  // Reset controls
  currentClip = null;
  els.playbackWrap.classList.add("hidden");
  els.playback.removeAttribute("src");
  els.playbackMeta.textContent = "";
  els.hintText.textContent = "Recording has started. Answer clearly and professionally.";

  // Auto-start recording
  recorder = new ClipRecorder(stream);
  recorder.start();

  els.recordBtn.disabled = true;
  els.recordBtn.classList.add("hidden");
  els.stopBtn.disabled = false;

  els.nextBtn.disabled = true;

  setStatus("Recording…");

  // AI voice reads the question + follow-up (hotel-standard tone)
  const voiceText = item.followupText
    ? `Question ${currentIdx + 1}. ${item.question.text} Follow-up: ${item.followupText}`
    : `Question ${currentIdx + 1}. ${item.question.text}`;

  els.aiText.textContent = `"${voiceText}"`;
  speak(voiceText);
}

// Interview recording controls
let recorder = null;

els.stopBtn.addEventListener("click", async () => {
  if (!recorder) return;
  let clip;
  try {
    clip = await recorder.stop();
  } catch (e) {
    console.error(e);
    setStatus("Stop failed");
    alert("Recording failed. Please try again.");
    els.recordBtn.disabled = false;
    els.stopBtn.disabled = true;
  
    els.nextBtn.disabled = true;
    return;
  }

  currentClip = clip;

  const url = URL.createObjectURL(clip.blob);
  els.playback.src = url;
  els.playbackWrap.classList.remove("hidden");
  els.playbackMeta.textContent = `Duration: ~${clip.durationSeconds}s • Size: ${formatBytes(clip.blob.size)}`;

  els.stopBtn.disabled = true;
  els.nextBtn.disabled = false;

  setStatus("Recorded");
});

// Retry button removed - no retakes allowed

els.nextBtn.addEventListener("click", () => {
  if (!currentClip) return;

  const item = interviewPlan[currentIdx];
  recordedClips.push({
    question_id: item.question.id,
    question_text: item.question.text,
    followup_text: item.followupText,
    blob: currentClip.blob,
    duration_seconds: currentClip.durationSeconds,
    mime_type: currentClip.mimeType,
  });

  // Next or submit
  currentIdx += 1;
  if (currentIdx < interviewPlan.length) {
    loadQuestion();
  } else {
    // Done answering
    submitInterview().catch((e) => {
      console.error(e);
      alert("Submission failed. Please try again or contact support.");
      setStatus("Submission failed");
      showStep(els.interview);
    });
  }
});

// -------------------------------
// Submit: create DB records, upload clips to Storage, then email careers@
// -------------------------------
async function submitInterview() {
  showStep(els.submit);
  setStatus("Uploading…");

  let interviewId = null;

  const candidateName = safeName(els.fullName.value);
  const candidateEmail = safeEmail(els.email.value);
  const ua = navigator.userAgent || "";
  const deviceHint = /Mobi|Android/i.test(ua) ? "mobile" : "desktop";

  // 1) Create interview session
  const { data: interview, error: interviewErr } = await supabase
    .from("interviews")
    .insert({
      candidate_name: candidateName,
      candidate_email: candidateEmail || null,
      role: CONFIG.role,
      mode: CONFIG.mode,
      status: "uploading",
      total_questions: recordedClips.length,
      user_agent: ua,
      device_hint: deviceHint,
      visibility_hidden_count: visibilityHiddenCount,
      practice_rerecords: practiceRerecords,
      speed_ping_ms: speedTestResults?.ping_ms ?? null,
      speed_download_mbps: speedTestResults?.download_mbps ?? null,
      speed_upload_mbps: speedTestResults?.upload_mbps ?? null,
      speed_rating: speedTestResults?.rating ?? null,
    })
    .select()
    .single();

  if (interviewErr) throw interviewErr;

  interviewId = interview.id;

  try {
    // 2) Upload practice clip if it exists
    if (practiceClip) {
      const ext = practiceClip.mimeType.includes("mp4") ? "mp4" : "webm";
      const practicePath = `interviews/${interviewId}/practice.${ext}`;

      els.uploadStatus.textContent = "Uploading practice recording…";

      const { error: practiceUpErr } = await supabase.storage
        .from("interviews")
        .upload(practicePath, practiceClip.blob, { contentType: practiceClip.mimeType, upsert: false });

      if (practiceUpErr) throw practiceUpErr;

      // Update interview record with practice storage info
      await supabase.from("interviews").update({
        practice_storage_path: practicePath,
        practice_mime_type: practiceClip.mimeType,
        practice_duration_seconds: practiceClip.durationSeconds,
      }).eq("id", interviewId);
    }

    // 3) Upload each interview clip + insert answer row
    const totalUploads = recordedClips.length;
    let completed = 0;

    for (let i = 0; i < recordedClips.length; i++) {
      const c = recordedClips[i];
      const ext = c.mime_type.includes("mp4") ? "mp4" : "webm";
      const path = `interviews/${interviewId}/q${String(i + 1).padStart(2, "0")}_${c.question_id}.${ext}`;

      els.uploadStatus.textContent = `Uploading ${i + 1} of ${totalUploads}…`;

      const { error: upErr } = await supabase.storage
        .from("interviews")
        .upload(path, c.blob, { contentType: c.mime_type, upsert: false });

      if (upErr) throw upErr;

      const { error: ansErr } = await supabase.from("interview_answers").insert({
        interview_id: interviewId,
        question_index: i + 1,
        question_text: c.question_text,
        followup_text: c.followup_text,
        storage_path: path,
        duration_seconds: c.duration_seconds,
        mime_type: c.mime_type,
      });

      if (ansErr) throw ansErr;

      completed += 1;
      const pct = Math.round((completed / totalUploads) * 100);
      els.uploadBar.style.width = `${pct}%`;
    }

    // 4) Trigger email to careers inbox (Edge Function)
    els.uploadStatus.textContent = "Sending notification…";
    const { error: fnErr } = await supabase.functions.invoke("send-interview-email", {
      body: {
        interview_id: interviewId,
        to_email: CAREERS_EMAIL,
      },
    });
    if (fnErr) throw fnErr;

    // Mark as submitted
    await supabase.from("interviews").update({ status: "submitted" }).eq("id", interviewId);

    // 5) Done
    els.uploadBar.style.width = "100%";
    els.uploadStatus.textContent = "Submitted.";
    setStatus("Submitted");
    showStep(els.done);
  } catch (e) {
    // Mark as failed if something breaks mid-flow
    try {
      if (interviewId) await supabase.from("interviews").update({ status: "failed" }).eq("id", interviewId);
    } catch {}
    throw e;
  } finally {
    // Stop camera
    try {
      stream?.getTracks?.().forEach((t) => t.stop());
    } catch {}
  }
}
