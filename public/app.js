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
const detectedRecipients = document.getElementById("detected-recipients");
const mailPreviews = document.getElementById("mail-previews");

const session = {
  smtp: null,
  resume: null,
  history: [],
  templates: {}
};

function setStatus(element, text, type = "info") {
  element.textContent = text;
  element.dataset.status = type;
}

function setActiveTab(name) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  tabPanels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.tabPanel !== name));
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function renderSessionSummary() {
  const smtpText = session.smtp
    ? `SMTP ready: ${session.smtp.user} via ${session.smtp.host}:${session.smtp.port}`
    : "SMTP not verified";
  const resumeText = session.resume
    ? `Resume saved for ${session.resume.fromName}${session.resume.resumeFileName ? ` (${session.resume.resumeFileName})` : ""}`
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
    smtpForm.elements.host.value = session.smtp.host || "smtp.gmail.com";
    smtpForm.elements.port.value = session.smtp.port || "465";
    smtpForm.elements.user.value = session.smtp.user || "";
    smtpForm.elements.secure.checked = Boolean(session.smtp.secure);
    smtpForm.elements.tlsRejectUnauthorized.checked = session.smtp.tlsRejectUnauthorized !== false;
    setStatus(smtpStatus, "SMTP is loaded from session memory.", "success");
  }

  if (session.resume) {
    resumeForm.elements.fromName.value = session.resume.fromName || "";
    resumeForm.elements.fromEmail.value = session.resume.fromEmail || "";
    resumeForm.elements.hrEmails.value = session.resume.hrEmails || "";
    setStatus(
      resumeStatus,
      `Resume details are loaded from session memory (${session.resume.resumeFileName}). ${session.resume.recipientCount || 0} recipient${session.resume.recipientCount === 1 ? "" : "s"} detected.`,
      "success"
    );
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
    el.textContent = option.label || option.subject;
    templateSelect.appendChild(el);
  });

  if (options.some((option) => option.key === previousValue)) {
    templateSelect.value = previousValue;
  }
}

function renderDetectedRecipients(recipients) {
  if (!recipients.length) {
    detectedRecipients.textContent = "No recipients detected yet.";
    detectedRecipients.className = "recipient-list empty-state";
    return;
  }

  detectedRecipients.className = "recipient-list";
  detectedRecipients.innerHTML = recipients
    .map((recipient) => {
      const label = recipient.name ? `${escapeHtml(recipient.name)} &lt;${escapeHtml(recipient.email)}&gt;` : escapeHtml(recipient.email);
      return `<div class="recipient-chip">${label}</div>`;
    })
    .join("");
}

function renderMailPreviews(previewData) {
  if (!previewData?.messages?.length) {
    mailPreviews.textContent = "Detected recipients and generated mails will appear here.";
    mailPreviews.className = "mail-preview-list empty-state";
    return;
  }

  mailPreviews.className = "mail-preview-list";
  mailPreviews.innerHTML = previewData.messages
    .map((message) => {
      const recipientLabel = message.recipient.name
        ? `${escapeHtml(message.recipient.name)} &lt;${escapeHtml(message.recipient.email)}&gt;`
        : escapeHtml(message.recipient.email);

      return `
        <article class="mail-preview-card">
          <div class="history-head">
            <div>
              <h3>${recipientLabel}</h3>
              <p>${escapeHtml(message.subject)}</p>
            </div>
          </div>
          <pre>${escapeHtml(message.content)}</pre>
        </article>
      `;
    })
    .join("");
}

function renderHistory() {
  dashboardEmpty.classList.toggle("hidden", session.history.length > 0);
  historyList.innerHTML = "";

  session.history.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";
    const sentMessages = entry.sentMessages?.length
      ? entry.sentMessages
          .map((message) => {
            const label = message.recipientName
              ? `${escapeHtml(message.recipientName)} &lt;${escapeHtml(message.recipient)}&gt;`
              : escapeHtml(message.recipient);

            return `
              <div class="history-message">
                <p><strong>To:</strong> ${label}</p>
                <pre>${escapeHtml(message.content)}</pre>
              </div>
            `;
          })
          .join("")
      : `<pre>${escapeHtml(entry.content)}</pre>`;

    card.innerHTML = `
      <div class="history-head">
        <div>
          <h3>${escapeHtml(entry.subject)}</h3>
          <p>${new Date(entry.createdAt).toLocaleString()}</p>
        </div>
        <span class="pill">${escapeHtml(entry.domain.toUpperCase())}</span>
      </div>
      <p><strong>From:</strong> ${escapeHtml(entry.fromName)} &lt;${escapeHtml(entry.fromEmail)}&gt;</p>
      <p><strong>Recipients:</strong> ${entry.recipients.map(escapeHtml).join(", ")}</p>
      ${sentMessages}
    `;
    historyList.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function refreshPreview() {
  if (!session.resume) {
    preview.textContent = "Save resume details first.";
    renderDetectedRecipients([]);
    renderMailPreviews(null);
    return;
  }

  const domain = sendForm.elements.domain.value;
  const templateKey = sendForm.elements.templateKey.value;
  if (!domain || !templateKey) {
    preview.textContent = "Select a profile and template to preview the email.";
    renderDetectedRecipients([]);
    renderMailPreviews(null);
    return;
  }

  try {
    const data = await requestJson("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain,
        templateKey,
        customSubject: sendForm.elements.customSubject.value,
        customNote: sendForm.elements.customNote.value
      })
    });

    renderDetectedRecipients(data.preview.recipients);
    preview.textContent = `Subject: ${data.preview.subject}\n\n${data.preview.firstPreview}`;
    renderMailPreviews(data.preview);
  } catch (error) {
    preview.textContent = error.message;
    renderMailPreviews(null);
  }
}

async function loadSession() {
  const data = await requestJson("/api/session");
  session.smtp = data.smtp || null;
  session.resume = data.resume || null;
  session.history = data.history || [];
  session.templates = data.templates || {};
  fillFormsFromSession();
  renderTemplateOptions();
  renderSessionSummary();
  renderHistory();
  await refreshPreview();
}

smtpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(smtpStatus, "Verifying SMTP...", "info");

  try {
    const data = await requestJson("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        smtp: {
          host: smtpForm.elements.host.value,
          port: smtpForm.elements.port.value,
          secure: smtpForm.elements.secure.checked,
          user: smtpForm.elements.user.value,
          pass: smtpForm.elements.pass.value,
          tlsRejectUnauthorized: smtpForm.elements.tlsRejectUnauthorized.checked
        }
      })
    });

    session.smtp = data.smtp;
    setStatus(smtpStatus, "SMTP verified and kept in session memory.", "success");
    renderSessionSummary();
  } catch (error) {
    setStatus(smtpStatus, error.message, "error");
  }
});

resumeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(resumeStatus, "Saving resume details...", "info");

  const uploadData = new FormData(resumeForm);

  try {
    const data = await requestJson("/api/resume", {
      method: "POST",
      body: uploadData
    });

    session.resume = data.resume;
    renderDetectedRecipients(data.recipients || []);
    setStatus(
      resumeStatus,
      `Resume file saved in session memory (${data.resume.resumeFileName}). ${(data.recipients || []).length} recipient${(data.recipients || []).length === 1 ? "" : "s"} detected.`,
      "success"
    );
    renderSessionSummary();
    await refreshPreview();
  } catch (error) {
    setStatus(resumeStatus, error.message, "error");
  }
});

resumeForm.elements.hrEmails.addEventListener("input", () => {
  preview.textContent = "Save resume details to refresh recipients and preview.";
  renderDetectedRecipients([]);
  renderMailPreviews(null);
});

sendForm.elements.domain.addEventListener("change", async () => {
  renderTemplateOptions();
  await refreshPreview();
});
sendForm.elements.templateKey.addEventListener("change", refreshPreview);
sendForm.elements.customSubject.addEventListener("input", refreshPreview);
sendForm.elements.customNote.addEventListener("input", refreshPreview);

sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(sendStatus, "Sending emails...", "info");

  try {
    const data = await requestJson("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: sendForm.elements.domain.value,
        templateKey: sendForm.elements.templateKey.value,
        customSubject: sendForm.elements.customSubject.value,
        customNote: sendForm.elements.customNote.value
      })
    });

    session.history.unshift(data.entry);
    setStatus(sendStatus, `Sent to ${data.entry.recipients.length} recipient(s).`, "success");
    renderSessionSummary();
    renderHistory();
    setActiveTab("dashboard");
  } catch (error) {
    setStatus(sendStatus, error.message, "error");
  }
});

loadSession().catch((error) => {
  sessionSummary.textContent = error.message || "Unable to load session.";
});
