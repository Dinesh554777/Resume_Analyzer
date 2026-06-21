/* ═══════════════════════════════════════════════════════════
   Advanced AI Resume Analyzer — Main Script
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY   = "ra_result_v2";
const RESUME_TEXT_KEY = "ra_resume_text";

/* ── Utilities ──────────────────────────────────────────────── */
const clamp  = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const fmtBytes = (b) => b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(2)} MB`;
const $ = (id) => document.getElementById(id);
const on = (el, ev, fn) => el?.addEventListener(ev, fn);

const getStored = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } };
const saveResult = (d) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...d, _at: new Date().toISOString() }));
const saveResumeText = (t) => localStorage.setItem(RESUME_TEXT_KEY, t);
const getResumeText  = () => localStorage.getItem(RESUME_TEXT_KEY) || "";

/* ── Toast ──────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = "info") {
  let toast = $("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ""; }, 3200);
}

/* ── Score Ring Animator ────────────────────────────────────── */
function setRingScore(ringEl, innerEl, score, color = "#6e40f2", color2 = "#00d4aa") {
  const s = clamp(score);
  const deg = s * 3.6;
  ringEl.style.background = `conic-gradient(${color} ${deg * 0.6}deg, ${color2} ${deg * 0.6}deg ${deg}deg, var(--surface-3) ${deg}deg)`;
  if (innerEl) innerEl.textContent = s + "%";
}

/* ── Number Counter Animation ───────────────────────────────── */
function animateCount(el, target, duration = 600) {
  const start = Date.now();
  const from  = parseInt(el.textContent, 10) || 0;
  const tick  = () => {
    const progress = Math.min((Date.now() - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (target - from) * ease);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── Fill Tag List ──────────────────────────────────────────── */
function fillTags(elId, items, cls = "") {
  const el = $(elId);
  if (!el) return;
  el.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    el.innerHTML = `<span class="tag">No data</span>`;
    return;
  }
  items.forEach(item => {
    const li = document.createElement("li");
    li.className = `tag ${cls}`;
    li.textContent = item;
    el.appendChild(li);
  });
}

/* ── Fill Detail List ───────────────────────────────────────── */
function fillDetails(elId, items, numbered = false) {
  const el = $(elId);
  if (!el) return;
  el.innerHTML = "";
  el.className = `detail-list${numbered ? " numbered-list" : ""}`;
  if (!Array.isArray(items) || !items.length) {
    el.innerHTML = `<div class="detail-item">No data returned</div>`;
    return;
  }
  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "detail-item";
    div.textContent = item;
    el.appendChild(div);
  });
}

/* ── Sub-score Ring ─────────────────────────────────────────── */
function setSubScore(cardId, score) {
  const card = $(cardId);
  if (!card) return;
  const ring  = card.querySelector(".sub-score-ring");
  const inner = card.querySelector(".sub-score-inner");
  if (!ring || !inner) return;
  const s   = clamp(score);
  const deg = s * 3.6;
  ring.style.background = `conic-gradient(#6e40f2 ${deg}deg, var(--surface-3) ${deg}deg)`;
  inner.textContent = s;
}

/* ════════════════════════════════════════════════════════════
   ANALYZER PAGE
   ════════════════════════════════════════════════════════════ */
function initAnalyzer() {
  const form       = $("upload-form");
  if (!form) return;

  const fileInput  = $("resume-file");
  const dropzone   = $("dropzone");
  const dzTitle    = $("dz-title");
  const dzMeta     = $("dz-meta");
  const analyzeBtn = $("analyzeBtn");
  const clearBtn   = $("clearBtn");
  const resultSec  = $("result-section");
  const statusPill = $("status-pill");
  const progressBar= $("progress-bar");
  const statusTitle= $("status-title");
  const statusMsg  = $("status-msg");
  const scoreRing  = $("score-ring");
  const scoreInner = $("score-ring-inner");
  const scoreNum   = $("score-number");

  const setStatus = (title, msg, pct, pillText = "Ready") => {
    if (statusTitle) statusTitle.textContent = title;
    if (statusMsg)   statusMsg.textContent   = msg;
    if (progressBar) progressBar.style.width = pct + "%";
    if (statusPill) {
      const last = statusPill.lastChild;
      if (last) last.textContent = " " + pillText;
    }
  };

  const updatePreview = () => {
    const f = fileInput?.files?.[0];
    if (!f) {
      if (dzTitle) dzTitle.textContent = "Drop your resume here";
      if (dzMeta)  dzMeta.textContent  = "PDF or DOCX · Max 10 MB";
      dropzone?.classList.remove("has-file");
      return;
    }
    if (dzTitle) dzTitle.textContent = f.name;
    if (dzMeta)  dzMeta.textContent  = fmtBytes(f.size) + " · " + (f.name.endsWith(".docx") ? "DOCX" : "PDF");
    dropzone?.classList.add("has-file");
    setStatus("Ready to analyze", "File loaded. Click Analyze to start.", 18, "Loaded");
  };

  const resetAll = () => {
    form.reset();
    updatePreview();
    if (scoreNum)   scoreNum.textContent = "--";
    if (scoreRing)  scoreRing.style.background = "conic-gradient(#6e40f2 0deg, var(--surface-3) 0deg)";
    if (scoreInner) scoreInner.textContent = "0%";
    ["skills-count","gaps-count","actions-count"].forEach(id => { if ($(id)) $(id).textContent = "0"; });
    setStatus("Waiting for resume", "Upload a PDF or DOCX file to get your ATS score, skill gaps, and career recommendations.", 0, "Ready");
    if (resultSec) resultSec.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // File input
  on(fileInput, "change", updatePreview);
  on(clearBtn, "click", resetAll);
  on($("resetViewBtn"), "click", resetAll);

  // Drag & Drop
  ["dragenter","dragover"].forEach(ev => on(dropzone, ev, e => { e.preventDefault(); dropzone.classList.add("is-dragging"); }));
  ["dragleave","drop"].forEach(ev => on(dropzone, ev, e => { e.preventDefault(); dropzone.classList.remove("is-dragging"); }));
  on(dropzone, "drop", e => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const ok = f.type === "application/pdf" || f.name.endsWith(".docx") || f.name.endsWith(".doc");
    if (!ok) { showToast("Please upload a PDF or DOCX file", "error"); return; }
    fileInput.files = e.dataTransfer.files;
    updatePreview();
  });

  // Submit
  on(form, "submit", async e => {
    e.preventDefault();
    const f = fileInput?.files?.[0];
    if (!f) { showToast("Please select a file first", "error"); return; }

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing…";
    setStatus("Reading resume", "Extracting text from your file…", 30, "Working");

    // Activate steps
    const steps = document.querySelectorAll(".step");
    steps[0]?.classList.add("active");

    const fd = new FormData();
    fd.append("file", f);

    try {
      setStatus("Sending to AI", "Groq LLM is analyzing your resume…", 55, "Working");
      steps[1]?.classList.add("active");

      const res  = await fetch("/analyze", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || data.error || "Server error");

      setStatus("Building report", "Scoring and preparing your results…", 82, "Working");
      steps[2]?.classList.add("active");

      saveResult(data);

      // Store resume text via a second call (parsed-info also extracts text server-side)
      // We'll store null so chat page uses uploaded file approach
      // For chat, we pass resume_text extracted in the /analyze endpoint
      // We'll expose raw text via a hidden field trick: store the file name
      localStorage.setItem("ra_last_file_name", f.name);

      renderAnalyzerResults(data);
      setStatus("Analysis complete", "Scroll down to review your results, or open the full report.", 100, "Done");
      showToast("Analysis complete! 🎉", "success");

    } catch (err) {
      console.error(err);
      setStatus("Analysis failed", err.message || "Something went wrong. Please try again.", 0, "Error");
      showToast(err.message || "Analysis failed", "error");
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Analyze Resume";
    }
  });

  // Restore last result if present
  const stored = getStored();
  if (stored) renderAnalyzerResults(stored);
}

function renderAnalyzerResults(data) {
  const resultSec = $("result-section");
  if (!resultSec) return;

  const score     = clamp(data.ats_score);
  const scoreNum  = $("score-number");
  const scoreRing = $("score-ring");
  const scoreInner= $("score-ring-inner");

  if (scoreNum)   { scoreNum.textContent = score || "--"; }
  if (scoreRing && scoreInner) setRingScore(scoreRing, scoreInner, score);

  // Quick stats
  const skillCount   = data.skills_identified?.length   || 0;
  const gapCount     = data.missing_skills?.length       || 0;
  const actionCount  = (data.project_suggestions?.length || 0) +
                       (data.resume_improvement_suggestions?.length || 0) +
                       (data.career_recommendations?.length || 0);

  if ($("skills-count")) animateCount($("skills-count"), skillCount);
  if ($("gaps-count"))   animateCount($("gaps-count"),   gapCount);
  if ($("actions-count"))animateCount($("actions-count"),actionCount);

  // Sub-scores
  setSubScore("sub-keyword",    data.keyword_score);
  setSubScore("sub-experience", data.experience_score);
  setSubScore("sub-project",    data.project_score);
  setSubScore("sub-education",  data.education_score);

  // Lists
  fillTags("skills-list",        data.skills_identified,            "green");
  fillTags("missing-skills-list",data.missing_skills,               "red");
  fillTags("missing-certs-list", data.missing_certifications,       "amber");
  fillTags("roles-list",         data.recommended_roles,            "indigo");
  fillDetails("strengths-list",  data.strengths);
  fillDetails("weaknesses-list", data.weaknesses);
  fillDetails("improvements-list",data.improvements);
  fillDetails("project-suggestions-list", data.project_suggestions, true);
  fillDetails("improvement-suggestions-list", data.resume_improvement_suggestions, true);
  fillDetails("career-recommendations-list", data.career_recommendations, true);
  fillDetails("interview-topics-list", data.interview_topics);

  resultSec.hidden = false;
  resultSec.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ════════════════════════════════════════════════════════════
   REPORT PAGE
   ════════════════════════════════════════════════════════════ */
function initReport() {
  const content = $("report-content");
  if (!content) return;

  const empty = $("report-empty");
  const data  = getStored();

  if (!data || typeof data !== "object") {
    if (empty)   empty.hidden   = false;
    if (content) content.hidden = true;
    return;
  }

  if (empty)   empty.hidden   = true;
  if (content) content.hidden = false;

  const score = clamp(data.ats_score);

  // Big ring
  const bigRing  = $("big-ring");
  const bigScore = $("big-score");
  if (bigRing && bigScore) {
    setRingScore(bigRing, null, score);
    bigScore.textContent = score;
  }

  // Verdict
  const verdict =
    score >= 80 ? "Strong ATS Alignment 🚀" :
    score >= 60 ? "Promising — Gaps Remain 📈" :
                  "Needs ATS Improvement ⚡";
  if ($("report-verdict"))      $("report-verdict").textContent = verdict;
  if ($("report-summary-text")) $("report-summary-text").textContent =
    "Here is a full visual breakdown of your resume's performance across all scoring dimensions.";

  // Readiness bars
  const skills     = data.skills_identified?.length || 0;
  const gaps       = data.missing_skills?.length    || 0;
  const strengths  = data.strengths?.length         || 0;
  const actions    = (data.project_suggestions?.length || 0) +
                     (data.resume_improvement_suggestions?.length || 0) +
                     (data.career_recommendations?.length || 0);

  const skillCoverage = skills + gaps ? Math.round((skills / (skills + gaps)) * 100) : 0;

  const barsEl = $("readiness-bars");
  if (barsEl) {
    barsEl.innerHTML = "";
    [
      ["ATS Score",     score],
      ["Skill Coverage",skillCoverage],
      ["Keyword Score", clamp(data.keyword_score)],
      ["Experience",    clamp(data.experience_score)],
      ["Projects",      clamp(data.project_score)],
      ["Education",     clamp(data.education_score)],
    ].forEach(([label, val]) => {
      const row = document.createElement("div");
      row.className = "readiness-row";
      row.innerHTML = `
        <span class="readiness-label">${label}</span>
        <div class="readiness-track"><div class="readiness-fill" style="width:${val}%"></div></div>
        <span class="readiness-val">${val}%</span>`;
      barsEl.appendChild(row);
    });
  }

  // Bar chart
  const chart = $("profile-chart");
  if (chart) {
    chart.innerHTML = "";
    [
      ["ATS Score",   score],
      ["Skills",      Math.min(100, skills * 10)],
      ["Gaps",        Math.min(100, gaps * 14)],
      ["Strengths",   Math.min(100, strengths * 16)],
      ["Actions",     Math.min(100, actions * 10)],
      ["Keyword",     clamp(data.keyword_score)],
    ].forEach(([label, val]) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <span class="bar-label">${label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${val}%"></div></div>
        <span class="bar-val">${val}%</span>`;
      chart.appendChild(row);
    });
  }

  // Donut
  const donut      = $("skills-donut");
  const donutInner = $("skills-donut-inner");
  const skillsRatio= $("skills-ratio");
  if (donut) {
    const deg = skillCoverage * 3.6;
    donut.style.background = `conic-gradient(var(--indigo) ${deg}deg, var(--surface-2) ${deg}deg)`;
    if (donutInner)  donutInner.textContent = skillCoverage + "%";
    if (skillsRatio) skillsRatio.textContent = `${skills} / ${skills + gaps}`;
  }

  // Results lists
  fillTags("report-skills-list",        data.skills_identified,            "green");
  fillTags("report-missing-skills-list",data.missing_skills,               "red");
  fillTags("report-roles-list",         data.recommended_roles,            "indigo");
  fillDetails("report-strengths-list",  data.strengths);
  fillDetails("report-weaknesses-list", data.weaknesses);
  fillDetails("report-improvements-list",data.improvements);
  fillDetails("report-project-suggestions-list",data.project_suggestions,  true);
  fillDetails("report-improvement-suggestions-list",data.resume_improvement_suggestions, true);
  fillDetails("report-career-recommendations-list",data.career_recommendations, true);
  fillDetails("report-interview-topics-list",data.interview_topics);
}

/* ════════════════════════════════════════════════════════════
   JD MATCH PAGE
   ════════════════════════════════════════════════════════════ */
function initJDMatch() {
  const form = $("jd-form");
  if (!form) return;

  on(form, "submit", async e => {
    e.preventDefault();
    const fileInput  = $("jd-resume-file");
    const jdText     = $("jd-text");
    const submitBtn  = $("jd-submit-btn");
    const resultSec  = $("jd-result-section");

    const f = fileInput?.files?.[0];
    if (!f) { showToast("Please upload your resume", "error"); return; }
    if (!jdText?.value.trim()) { showToast("Please paste a job description", "error"); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "Matching…";

    const fd = new FormData();
    fd.append("file", f);
    fd.append("job_description", jdText.value.trim());

    try {
      const res  = await fetch("/analyze/jd-match", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");

      renderJDResult(data);
      if (resultSec) resultSec.hidden = false;
      resultSec?.scrollIntoView({ behavior: "smooth" });
      showToast("Match analysis complete!", "success");
    } catch (err) {
      showToast(err.message || "Match failed", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Analyze Match";
    }
  });
}

function renderJDResult(data) {
  const pct    = clamp(data.match_percentage);
  const ring   = $("match-ring");
  const pctEl  = $("match-pct");

  if (ring && pctEl) {
    const deg = pct * 3.6;
    ring.style.background = `conic-gradient(#6e40f2 ${deg * 0.5}deg, #00d4aa ${deg * 0.5}deg ${deg}deg, var(--surface-3) ${deg}deg)`;
    animateCount(pctEl, pct);
  }

  // Verdict color
  const verdict = $("match-verdict");
  if (verdict) {
    const v = pct >= 75 ? "Strong Match ✅" : pct >= 50 ? "Moderate Match ⚡" : "Weak Match ⚠️";
    verdict.textContent = v;
  }

  fillTags("matched-skills-list",  data.matched_skills,  "green");
  fillTags("missing-skills-jd",    data.missing_skills,  "red");
  fillTags("keyword-overlap-list", data.keyword_overlap, "cyan");

  if ($("experience-fit"))     $("experience-fit").textContent     = data.experience_fit     || "N/A";
  if ($("overall-assessment")) $("overall-assessment").textContent = data.overall_assessment || "N/A";
}

/* ════════════════════════════════════════════════════════════
   CHAT PAGE
   ════════════════════════════════════════════════════════════ */
function initChat() {
  const sendBtn    = $("send-btn");
  const chatInput  = $("chat-input");
  const messages   = $("chat-messages");
  const uploadWarn = $("upload-warn");

  if (!sendBtn || !chatInput || !messages) return;

  // Check if a resume was analyzed
  const lastFile = localStorage.getItem("ra_last_file_name");
  if (!lastFile && uploadWarn) uploadWarn.hidden = false;

  // Suggested questions
  document.querySelectorAll(".suggested-btn").forEach(btn => {
    on(btn, "click", () => {
      chatInput.value = btn.dataset.q || btn.textContent;
      chatInput.focus();
    });
  });

  const appendBubble = (text, type) => {
    const div = document.createElement("div");
    div.className = `chat-bubble bubble-${type} fade-up`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  };

  const showTyping = () => {
    const div = document.createElement("div");
    div.className = "bubble-typing";
    div.id = "typing-indicator";
    div.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  };

  const sendMessage = async () => {
    const q = chatInput.value.trim();
    if (!q) return;

    // Clear empty state
    const empty = messages.querySelector(".bubble-empty");
    if (empty) empty.remove();

    appendBubble(q, "user");
    chatInput.value = "";
    sendBtn.disabled = true;

    const typing = showTyping();

    try {
      // We need resume text — prompt user to use analyzer first if no stored result
      const stored = getStored();
      const resumeText = stored ? buildResumeContext(stored) : "";

      const fd = new FormData();
      fd.append("question", q);
      fd.append("resume_text", resumeText);

      const res  = await fetch("/analyze/chat", { method: "POST", body: fd });
      const data = await res.json();

      typing.remove();

      if (!res.ok) throw new Error(data.error || "Server error");
      appendBubble(data.answer, "ai");
    } catch (err) {
      typing.remove();
      appendBubble("⚠️ " + (err.message || "Something went wrong. Please try again."), "ai");
    } finally {
      sendBtn.disabled = false;
    }
  };

  on(sendBtn, "click", sendMessage);
  on(chatInput, "keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
}

function buildResumeContext(data) {
  // Build a text summary from stored analysis data
  const lines = [];
  if (data.skills_identified?.length) lines.push("Skills: " + data.skills_identified.join(", "));
  if (data.missing_skills?.length)    lines.push("Missing skills: " + data.missing_skills.join(", "));
  if (data.strengths?.length)         lines.push("Strengths: " + data.strengths.join("; "));
  if (data.weaknesses?.length)        lines.push("Weaknesses: " + data.weaknesses.join("; "));
  if (data.recommended_roles?.length) lines.push("Recommended roles: " + data.recommended_roles.join(", "));
  if (data.career_recommendations?.length) lines.push("Career recommendations: " + data.career_recommendations.join("; "));
  if (data.ats_score !== undefined)   lines.push("ATS Score: " + data.ats_score);
  return lines.join("\n");
}

/* ════════════════════════════════════════════════════════════
   COVER LETTER PAGE
   ════════════════════════════════════════════════════════════ */
function initCoverLetter() {
  const form    = $("cl-form");
  if (!form) return;

  const output  = $("cl-output");
  const placeholder = $("cl-placeholder");
  const letterCard  = $("cl-letter-card");
  const copyBtn     = $("cl-copy-btn");
  const downloadBtn = $("cl-download-btn");

  on(form, "submit", async e => {
    e.preventDefault();
    const file    = $("cl-resume-file")?.files?.[0];
    const company = $("cl-company")?.value.trim();
    const title   = $("cl-title")?.value.trim();
    const jd      = $("cl-jd")?.value.trim();
    const btn     = $("cl-submit-btn");

    if (!file)    { showToast("Please upload your resume", "error"); return; }
    if (!company) { showToast("Please enter the company name", "error"); return; }
    if (!title)   { showToast("Please enter the job title", "error"); return; }
    if (!jd)      { showToast("Please paste the job description", "error"); return; }

    btn.disabled = true;
    btn.textContent = "Generating…";

    const fd = new FormData();
    fd.append("file",            file);
    fd.append("company_name",    company);
    fd.append("job_title",       title);
    fd.append("job_description", jd);

    try {
      const res  = await fetch("/analyze/cover-letter", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");

      if (placeholder) placeholder.hidden = true;
      if (letterCard) {
        letterCard.hidden = false;
        letterCard.textContent = data.cover_letter;
      }
      if (output) output.hidden = false;
      showToast("Cover letter generated! 📝", "success");
    } catch (err) {
      showToast(err.message || "Generation failed", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate Cover Letter";
    }
  });

  on(copyBtn, "click", () => {
    const text = letterCard?.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard! ✅", "success"));
  });

  on(downloadBtn, "click", () => {
    const text = letterCard?.textContent;
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "cover_letter.txt";
    a.click(); URL.revokeObjectURL(url);
    showToast("Downloaded!", "success");
  });
}

/* ════════════════════════════════════════════════════════════
   HOME PAGE — Live mock animation
   ════════════════════════════════════════════════════════════ */
function initHome() {
  const ring = document.querySelector(".mock-ring");
  if (!ring) return;
  // Animate the ring value on load
  let v = 0;
  const target = 82;
  const tick = () => {
    v = Math.min(v + 1.5, target);
    ring.style.setProperty("--v", v);
    ring.style.background = `conic-gradient(#6e40f2 ${v * 3.6}deg, var(--surface-3) 0)`;
    const inner = ring.querySelector(".mock-ring-inner");
    if (inner) inner.textContent = Math.round(v);
    if (v < target) requestAnimationFrame(tick);
  };
  setTimeout(() => requestAnimationFrame(tick), 500);
}

/* ════════════════════════════════════════════════════════════
   RESOURCES PAGE — meter animation
   ════════════════════════════════════════════════════════════ */
function initResources() {
  const meters = document.querySelectorAll(".meter-fill");
  if (!meters.length) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        el.style.width = el.dataset.w || "0%";
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.3 });
  meters.forEach(m => observer.observe(m));
}

/* ════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  initHome();
  initAnalyzer();
  initReport();
  initJDMatch();
  initChat();
  initCoverLetter();
  initResources();

  // Toast element
  const toast = document.createElement("div");
  toast.id = "toast";
  document.body.appendChild(toast);
});
