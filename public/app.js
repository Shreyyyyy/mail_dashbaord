const tabs = Array.from(document.querySelectorAll(".tab"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

const smtpForm = document.getElementById("smtp-form");
const resumeForm = document.getElementById("resume-form");
const sendForm = document.getElementById("send-form");

const smtpStatus = document.getElementById("smtp-status");
const resumeStatus = document.getElementById("resume-status");
const sendStatus = document.getElementById("send-status");
const preview = document.getElementById("email-preview");
const templateSelect = sendForm.elements.templateKey;
const sessionSummary = document.getElementById("session-summary");
const historyList = document.getElementById("history-list");
const dashboardEmpty = document.getElementById("dashboard-empty");

const session = {
  smtp: null,
  resume: null,
  history: [],
  templates: {}
};

const templateLabels = {
  marketing: {
    fresher_campaign: "Campaign starter",
    fresher_growth: "Growth-focused",
    fresher_brand: "Brand and content"
  },
  hr: {
    fresher_people_ops: "People operations",
    fresher_talent: "Talent acquisition",
    fresher_generalist: "HR generalist"
  }
};

function setActiveTab(name) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  tabPanels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.tabPanel !== name));
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

function renderSessionSummary() {
  const smtpText = session.smtp
    ? `SMTP ready: ${session.smtp.user} via ${session.smtp.host}:${session.smtp.port}`
    : "SMTP not verified";
  const resumeText = session.resume
    ? `Resume saved for ${session.resume.fromName}`
    : "Resume not saved";
  const historyText = `${session.history.length} mail${session.history.length === 1 ? "" : "s"} in dashboard`;

  sessionSummary.innerHTML = `
    <strong>${smtpText}</strong>
    <span>${resumeText}</span>
    <span>${historyText}</span>
  `;
}

function fillFormsFromSession() {
  if (session.smtp) {
    smtpForm.elements.host.value = session.smtp.host || "";
    smtpForm.elements.port.value = session.smtp.port || "";
    smtpForm.elements.user.value = session.smtp.user || "";
    smtpForm.elements.secure.checked = Boolean(session.smtp.secure);
    smtpForm.elements.tlsRejectUnauthorized.checked = session.smtp.tlsRejectUnauthorized !== false;
    smtpStatus.textContent = "SMTP is loaded from session memory.";
  }

  if (session.resume) {
    resumeForm.elements.fromName.value = session.resume.fromName || "";
    resumeForm.elements.fromEmail.value = session.resume.fromEmail || "";
    resumeForm.elements.hrEmails.value = session.resume.hrEmails || "";
    resumeStatus.textContent = `Resume details are loaded from session memory (${session.resume.resumeFileName}).`;
  }
}

function renderTemplateOptions() {
  const domain = sendForm.elements.domain.value;
  const options = session.templates[domain] || [];
  const previousValue = templateSelect.value;

  templateSelect.innerHTML = '<option value="">Select template</option>';

  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option.key;
    el.textContent = templateLabels[domain]?.[option.key] || option.subject;
    templateSelect.appendChild(el);
  });

  if (options.some((option) => option.key === previousValue)) {
    templateSelect.value = previousValue;
  }
}

function currentTemplate() {
  const domain = sendForm.elements.domain.value;
  const templateKey = sendForm.elements.templateKey.value;
  return (session.templates[domain] || []).find((option) => option.key === templateKey);
}

function updatePreview() {
  const template = currentTemplate();
  if (!template || !session.resume) {
    preview.textContent = "Select a profile and template to preview the email.";
    return;
  }

  const subject = sendForm.elements.customSubject.value.trim() || template.subject;
  const customNote = sendForm.elements.customNote.value.trim();

  fetch("/api/session")
    .then((res) => res.json())
    .then((data) => {
      session.templates = data.templates || session.templates;
      const options = session.templates[sendForm.elements.domain.value] || [];
      const selected = options.find((option) => option.key === sendForm.elements.templateKey.value);
      if (!selected) throw new Error("Template not found.");

      const body = buildPreviewBody(sendForm.elements.domain.value, sendForm.elements.templateKey.value);
      preview.textContent = `Subject: ${subject}\n\n${customNote ? `${body}\n\nAdditional Note:\n${customNote}` : body}`;
    })
    .catch(() => {
      preview.textContent = "Unable to build preview.";
    });
}

function buildPreviewBody(domain, templateKey) {
  const name = session.resume.fromName;
  const resumeText = `Attached resume: ${session.resume.resumeFileName}`;
  const bodies = {
    marketing: {
      fresher_campaign:
        `Hello [HR Name],\n\nI am ${name}, a fresher eager to begin my career in marketing. I enjoy shaping clear messaging, supporting campaign execution, and learning quickly in fast-moving teams.\n\nHighlights:\n- Strong interest in content, brand communication, and audience research\n- Comfortable with coordination, writing, and structured execution\n- Ready to contribute with energy and consistency from day one\n\nResume:\n${resumeText}\n\nThank you for your time. I would value the opportunity to speak about any suitable marketing openings.\n\nBest regards,\n${name}`,
      fresher_growth:
        `Hello [HR Name],\n\nI am ${name}, a fresher interested in marketing roles with a strong growth and performance focus. I am motivated by experimentation, digital channels, and measurable business impact.\n\nHighlights:\n- Interest in social media, campaign analysis, and lead generation\n- Analytical mindset with willingness to test, learn, and improve quickly\n- Strong ownership and follow-through on execution tasks\n\nResume:\n${resumeText}\n\nI would appreciate the chance to discuss how I can support your marketing team in an entry-level role.\n\nBest regards,\n${name}`,
      fresher_brand:
        `Hello [HR Name],\n\nI am ${name}, a fresher seeking an opportunity to start my marketing career. I am especially interested in brand building, content planning, and customer-focused communication.\n\nHighlights:\n- Strong written communication and creative problem-solving skills\n- Interest in campaign planning, storytelling, and cross-team collaboration\n- Adaptable, proactive, and committed to continuous learning\n\nResume:\n${resumeText}\n\nPlease consider my profile for relevant fresher marketing roles. I would be glad to connect.\n\nBest regards,\n${name}`
    },
    hr: {
      fresher_people_ops:
        `Hello [HR Name],\n\nI am ${name}, a fresher looking to begin my career in HR. I am interested in people operations, employee support, and building strong workplace experiences.\n\nHighlights:\n- Strong communication, coordination, and organizational skills\n- Interest in onboarding, employee engagement, and HR processes\n- Reliable, empathetic, and eager to learn from structured HR teams\n\nResume:\n${resumeText}\n\nThank you for your time. I would welcome the opportunity to discuss any entry-level HR openings.\n\nBest regards,\n${name}`,
      fresher_talent:
        `Hello [HR Name],\n\nI am ${name}, a fresher interested in HR roles, especially in recruitment and talent coordination. I am keen to contribute to candidate experience and hiring operations.\n\nHighlights:\n- Interest in recruitment workflow, screening coordination, and candidate communication\n- Strong interpersonal skills with an organized and process-oriented approach\n- Quick learner ready to support hiring teams effectively\n\nResume:\n${resumeText}\n\nI would appreciate the opportunity to be considered for fresher HR or talent acquisition openings.\n\nBest regards,\n${name}`,
      fresher_generalist:
        `Hello [HR Name],\n\nI am ${name}, a fresher seeking to start my career in human resources. I am motivated by the chance to support employees, improve coordination, and contribute to strong internal processes.\n\nHighlights:\n- Good communication, documentation, and stakeholder coordination skills\n- Interest in policy support, onboarding, and employee engagement activities\n- Dependable and eager to grow within an HR generalist role\n\nResume:\n${resumeText}\n\nPlease consider my profile for suitable entry-level HR opportunities. I would be glad to connect.\n\nBest regards,\n${name}`
    }
  };

  return bodies?.[domain]?.[templateKey] || "Template not found.";
}

function renderHistory() {
  dashboardEmpty.classList.toggle("hidden", session.history.length > 0);
  historyList.innerHTML = "";

  session.history.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";
    card.innerHTML = `
      <div class="history-head">
        <div>
          <h3>${entry.subject}</h3>
          <p>${new Date(entry.createdAt).toLocaleString()}</p>
        </div>
        <span class="pill">${entry.domain.toUpperCase()}</span>
      </div>
      <p><strong>From:</strong> ${entry.fromName} &lt;${entry.fromEmail}&gt;</p>
      <p><strong>Recipients:</strong> ${entry.recipients.join(", ")}</p>
      <pre>${entry.content}</pre>
    `;
    historyList.appendChild(card);
  });
}

async function loadSession() {
  const res = await fetch("/api/session");
  const data = await res.json();
  session.smtp = data.smtp || null;
  session.resume = data.resume || null;
  session.history = data.history || [];
  session.templates = data.templates || {};
  fillFormsFromSession();
  renderTemplateOptions();
  renderSessionSummary();
  renderHistory();
}

smtpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  smtpStatus.textContent = "Verifying...";

  const formData = new FormData(smtpForm);
  const payload = {
    smtp: {
      host: formData.get("host"),
      port: formData.get("port"),
      secure: formData.get("secure") === "on",
      user: formData.get("user"),
      pass: formData.get("pass"),
      tlsRejectUnauthorized: formData.get("tlsRejectUnauthorized") === "on"
    }
  };

  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Verification failed.");

    session.smtp = data.smtp;
    smtpStatus.textContent = "SMTP verified and kept in session memory.";
    renderSessionSummary();
  } catch (err) {
    smtpStatus.textContent = err.message;
  }
});

resumeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resumeStatus.textContent = "Saving...";

  const formData = new FormData(resumeForm);
  const payload = {
    fromName: formData.get("fromName").trim(),
    fromEmail: formData.get("fromEmail").trim(),
    hrEmails: formData.get("hrEmails").trim()
  };
  const uploadData = new FormData();
  uploadData.append("fromName", payload.fromName);
  uploadData.append("fromEmail", payload.fromEmail);
  uploadData.append("hrEmails", payload.hrEmails);
  if (resumeForm.elements.resumeFile.files[0]) {
    uploadData.append("resumeFile", resumeForm.elements.resumeFile.files[0]);
  }

  try {
    const res = await fetch("/api/resume", {
      method: "POST",
      body: uploadData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Resume save failed.");

    session.resume = data.resume;
    resumeStatus.textContent = `Resume file saved in session memory (${data.resume.resumeFileName}).`;
    renderSessionSummary();
    updatePreview();
  } catch (err) {
    resumeStatus.textContent = err.message;
  }
});

sendForm.elements.domain.addEventListener("change", () => {
  renderTemplateOptions();
  updatePreview();
});
sendForm.elements.templateKey.addEventListener("change", updatePreview);
sendForm.elements.customSubject.addEventListener("input", updatePreview);
sendForm.elements.customNote.addEventListener("input", updatePreview);

sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  sendStatus.textContent = "Sending...";

  const formData = new FormData(sendForm);
  const payload = {
    domain: formData.get("domain"),
    templateKey: formData.get("templateKey"),
    customSubject: formData.get("customSubject"),
    customNote: formData.get("customNote")
  };

  try {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Send failed.");

    session.history.unshift(data.entry);
    sendStatus.textContent = `Sent to ${data.accepted?.length || 0} recipient(s).`;
    renderSessionSummary();
    renderHistory();
    setActiveTab("dashboard");
  } catch (err) {
    sendStatus.textContent = err.message;
  }
});

loadSession().catch(() => {
  sessionSummary.textContent = "Unable to load session.";
});
