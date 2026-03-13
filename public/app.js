const tabs = Array.from(document.querySelectorAll(".tab[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

const accountSummary = document.getElementById("account-summary");
const setupForm = document.getElementById("setup-form");
const quickSendForm = document.getElementById("quick-send-form");

const setupStatus = document.getElementById("setup-status");
const sendStatus = document.getElementById("send-status");

const preview = document.getElementById("email-preview");
const detectedRecipients = document.getElementById("detected-recipients");
const mailPreviews = document.getElementById("mail-previews");
const historyList = document.getElementById("history-list");
const dashboardEmpty = document.getElementById("dashboard-empty");

const state = {
  user: null,
  templates: {}
};

function setStatus(element, text, type = "info") {
  element.textContent = text;
  element.dataset.status = type;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function renderAccountSummary() {
  const setupDone = Boolean(state.user?.smtpAccount && state.user?.senderProfile);
  const smtpUser = state.user?.smtpAccount?.user || "Not configured";
  const template = state.user?.senderProfile
    ? `${state.user.senderProfile.domain} / ${state.user.senderProfile.templateKey}`
    : "Not configured";

  accountSummary.innerHTML = `
    <h2>${setupDone ? "Setup Ready" : "Setup Required"}</h2>
    <p>${setupDone ? "SMTP, resume, and template are configured." : "Complete setup before sending mails."}</p>
    <p><strong>SMTP:</strong> ${escapeHtml(smtpUser)}</p>
    <p><strong>Template:</strong> ${escapeHtml(template)}</p>
    <p>${state.user?.history?.length || 0} mail batch${state.user?.history?.length === 1 ? "" : "es"} in your dashboard</p>
  `;
}

function renderTemplateOptions() {
  const domain = setupForm.elements.domain.value;
  const templateSelect = setupForm.elements.templateKey;
  const options = state.templates[domain] || [];
  const previous = templateSelect.value;
  templateSelect.innerHTML = '<option value="">Select template</option>';

  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option.key;
    el.textContent = option.label || option.subject;
    templateSelect.appendChild(el);
  });

  if (options.some((option) => option.key === previous)) {
    templateSelect.value = previous;
  }
}

function fillSetupForm() {
  const smtp = state.user?.smtpAccount;
  const profile = state.user?.senderProfile;

  if (smtp) {
    setupForm.elements.host.value = smtp.host || "smtp.gmail.com";
    setupForm.elements.port.value = smtp.port || "465";
    setupForm.elements.user.value = smtp.user || "";
    setupForm.elements.secure.checked = Boolean(smtp.secure);
    setupForm.elements.tlsRejectUnauthorized.checked = smtp.tlsRejectUnauthorized !== false;
  }

  if (profile) {
    setupForm.elements.domain.value = profile.domain || "";
    renderTemplateOptions();
    setupForm.elements.templateKey.value = profile.templateKey || "";
    setStatus(setupStatus, `Saved resume: ${profile.resumeFileName}`, "success");
  }
}

function renderDetectedRecipients(recipients) {
  if (!recipients?.length) {
    detectedRecipients.textContent = "No recipients detected yet.";
    detectedRecipients.className = "recipient-list empty-state";
    return;
  }
  detectedRecipients.className = "recipient-list";
  detectedRecipients.innerHTML = recipients
    .map((recipient) => {
      return `<div class="recipient-chip">${escapeHtml(recipient.email)}</div>`;
    })
    .join("");
}

function renderMailPreviews(messages) {
  if (!messages?.length) {
    mailPreviews.textContent = "Generated mails will appear here.";
    mailPreviews.className = "mail-preview-list empty-state";
    return;
  }

  mailPreviews.className = "mail-preview-list";
  mailPreviews.innerHTML = messages
    .map((message) => {
      return `
        <article class="mail-preview-card">
          <div class="history-head">
            <div>
              <h3>${escapeHtml(message.recipient.email)}</h3>
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
  const history = state.user?.history || [];
  dashboardEmpty.classList.toggle("hidden", history.length > 0);
  historyList.innerHTML = "";

  history.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";
    const sentMessages = (entry.sentMessages || [])
      .map((message) => {
        return `
          <div class="history-message">
            <p><strong>To:</strong> ${escapeHtml(message.recipient)}</p>
            <pre>${escapeHtml(message.content)}</pre>
          </div>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="history-head">
        <div>
          <h3>${escapeHtml(entry.subject)}</h3>
          <p>${new Date(entry.createdAt).toLocaleString()}</p>
        </div>
      </div>
      <p><strong>Recipients:</strong> ${(entry.recipients || []).map(escapeHtml).join(", ")}</p>
      ${sentMessages}
    `;
    historyList.appendChild(card);
  });
}

async function refreshBootstrap() {
  const data = await requestJson("/api/bootstrap");
  state.user = data.user;
  state.templates = data.templates || {};
  renderAccountSummary();
  fillSetupForm();
  renderHistory();
}

async function refreshPreview() {
  if (!state.user?.smtpAccount || !state.user?.senderProfile) {
    preview.textContent = "Complete setup first.";
    renderDetectedRecipients([]);
    renderMailPreviews(null);
    return;
  }

  const recipientText = quickSendForm.elements.recipientText.value.trim();
  if (!recipientText) {
    preview.textContent = "Paste emails to preview the generated mails.";
    renderDetectedRecipients([]);
    renderMailPreviews(null);
    return;
  }

  try {
    const data = await requestJson("/api/user/send/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientText })
    });
    renderDetectedRecipients(data.recipients);
    preview.textContent = `Subject: ${data.subject}\n\n${data.messages[0]?.content || ""}`;
    renderMailPreviews(data.messages);
  } catch (error) {
    preview.textContent = error.message;
    renderDetectedRecipients([]);
    renderMailPreviews(null);
  }
}

setupForm.elements.domain.addEventListener("change", renderTemplateOptions);

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(setupStatus, "Saving setup...", "info");

  try {
    const data = await requestJson("/api/user/setup", {
      method: "POST",
      body: new FormData(setupForm)
    });
    state.user = data.user;
    renderAccountSummary();
    renderHistory();
    setStatus(setupStatus, "Setup saved.", "success");
    setActiveTab("send");
    await refreshPreview();
  } catch (error) {
    setStatus(setupStatus, error.message, "error");
  }
});

quickSendForm.elements.recipientText.addEventListener("input", refreshPreview);

quickSendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(sendStatus, "Sending emails...", "info");

  try {
    const data = await requestJson("/api/user/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientText: quickSendForm.elements.recipientText.value })
    });
    state.user = data.user;
    renderAccountSummary();
    renderHistory();
    setStatus(sendStatus, `Sent to ${data.sent} recipient(s).`, "success");
    setActiveTab("dashboard");
  } catch (error) {
    setStatus(sendStatus, error.message, "error");
  }
});

refreshBootstrap()
  .then(() => {
    renderTemplateOptions();
  })
  .catch((error) => {
    accountSummary.textContent = error.message || "Unable to load portal.";
  });
