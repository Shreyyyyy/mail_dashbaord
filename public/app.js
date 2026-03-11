const tabs = Array.from(document.querySelectorAll(".tab"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

const setupForm = document.getElementById("setup-form");
const quickSendForm = document.getElementById("quick-send-form");

const setupStatus = document.getElementById("setup-status");
const sendStatus = document.getElementById("send-status");
const senderSummary = document.getElementById("sender-summary");
const preview = document.getElementById("email-preview");
const detectedRecipients = document.getElementById("detected-recipients");
const mailPreviews = document.getElementById("mail-previews");
const historyList = document.getElementById("history-list");
const dashboardEmpty = document.getElementById("dashboard-empty");

const state = {
  configured: false,
  sender: null,
  templates: {},
  history: []
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

function renderSummary() {
  if (!state.configured || !state.sender) {
    senderSummary.innerHTML = `
      <h2>Setup Needed</h2>
      <p class="small">Complete the one-time setup first. After that, users can work only from the Send Now tab.</p>
    `;
    return;
  }

  senderSummary.innerHTML = `
    <h2>Configured Sender</h2>
    <p><strong>${escapeHtml(state.sender.profile.fromName)}</strong> &lt;${escapeHtml(state.sender.profile.fromEmail)}&gt;</p>
    <p>${escapeHtml(state.sender.smtp.user)} via ${escapeHtml(state.sender.smtp.host)}:${escapeHtml(state.sender.smtp.port)}</p>
    <p>Default template: ${escapeHtml(state.sender.profile.domain)} / ${escapeHtml(state.sender.profile.templateKey)}</p>
    <p>Resume: ${escapeHtml(state.sender.profile.resumeFileName)}</p>
  `;
}

function renderTemplateOptions() {
  const domain = setupForm.elements.domain.value;
  const target = setupForm.elements.templateKey;
  const options = state.templates[domain] || [];
  const previous = target.value;

  target.innerHTML = '<option value="">Select template</option>';
  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option.key;
    el.textContent = option.label || option.subject;
    target.appendChild(el);
  });
  if (options.some((option) => option.key === previous)) {
    target.value = previous;
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

function renderMailPreviews(messages) {
  if (!messages?.length) {
    mailPreviews.textContent = "Generated mails will appear here.";
    mailPreviews.className = "mail-preview-list empty-state";
    return;
  }

  mailPreviews.className = "mail-preview-list";
  mailPreviews.innerHTML = messages
    .map((message) => {
      const label = message.recipient.name
        ? `${escapeHtml(message.recipient.name)} &lt;${escapeHtml(message.recipient.email)}&gt;`
        : escapeHtml(message.recipient.email);
      return `
        <article class="mail-preview-card">
          <div class="history-head">
            <div>
              <h3>${label}</h3>
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
  dashboardEmpty.classList.toggle("hidden", state.history.length > 0);
  historyList.innerHTML = "";

  state.history.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";
    const sentMessages = (entry.sentMessages || [])
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

function fillSetupForm() {
  if (!state.sender) return;
  setupForm.elements.host.value = state.sender.smtp.host || "smtp.gmail.com";
  setupForm.elements.port.value = state.sender.smtp.port || "465";
  setupForm.elements.user.value = state.sender.smtp.user || "";
  setupForm.elements.secure.checked = Boolean(state.sender.smtp.secure);
  setupForm.elements.tlsRejectUnauthorized.checked = state.sender.smtp.tlsRejectUnauthorized !== false;
  setupForm.elements.fromName.value = state.sender.profile.fromName || "";
  setupForm.elements.fromEmail.value = state.sender.profile.fromEmail || "";
  setupForm.elements.domain.value = state.sender.profile.domain || "";
  renderTemplateOptions();
  setupForm.elements.templateKey.value = state.sender.profile.templateKey || "";
  setupForm.elements.customSubject.value = state.sender.profile.customSubject || "";
  setupForm.elements.customNote.value = state.sender.profile.customNote || "";
}

async function loadState() {
  const data = await requestJson("/api/state");
  state.configured = data.configured;
  state.sender = data.sender;
  state.templates = data.templates || {};
  state.history = data.history || [];
  renderSummary();
  fillSetupForm();
  renderHistory();
}

async function refreshQuickPreview() {
  const recipientText = quickSendForm.elements.recipientText.value.trim();
  if (!state.configured) {
    preview.textContent = "Complete setup once before sending.";
    renderDetectedRecipients([]);
    renderMailPreviews(null);
    return;
  }
  if (!recipientText) {
    preview.textContent = "Paste emails to preview the generated mails.";
    renderDetectedRecipients([]);
    renderMailPreviews(null);
    return;
  }

  try {
    const data = await requestJson("/api/send/preview", {
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
quickSendForm.elements.recipientText.addEventListener("input", refreshQuickPreview);

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(setupStatus, "Saving setup...", "info");

  try {
    const data = await requestJson("/api/setup", {
      method: "POST",
      body: new FormData(setupForm)
    });
    state.configured = data.state.configured;
    state.sender = data.state.sender;
    state.templates = data.state.templates;
    state.history = data.state.history;
    renderSummary();
    fillSetupForm();
    renderHistory();
    setStatus(setupStatus, "Setup saved. Future users can work only from Send Now.", "success");
    setActiveTab("send");
    await refreshQuickPreview();
  } catch (error) {
    setStatus(setupStatus, error.message, "error");
  }
});

quickSendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(sendStatus, "Sending emails...", "info");

  try {
    const data = await requestJson("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientText: quickSendForm.elements.recipientText.value
      })
    });
    state.history = data.history || [];
    renderHistory();
    setStatus(sendStatus, `Sent to ${data.sent} recipient(s).`, "success");
    setActiveTab("dashboard");
  } catch (error) {
    setStatus(sendStatus, error.message, "error");
  }
});

loadState().catch((error) => {
  senderSummary.textContent = error.message || "Unable to load app state.";
});
