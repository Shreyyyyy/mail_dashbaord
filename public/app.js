const tabs = Array.from(document.querySelectorAll(".tab[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

const authPanel = document.getElementById("auth-panel");
const portalShell = document.getElementById("portal-shell");
const accountSummary = document.getElementById("account-summary");

const registerRequestForm = document.getElementById("register-request-form");
const registerVerifyForm = document.getElementById("register-verify-form");
const loginRequestForm = document.getElementById("login-request-form");
const loginVerifyForm = document.getElementById("login-verify-form");
const setupForm = document.getElementById("setup-form");
const quickSendForm = document.getElementById("quick-send-form");

const registerRequestStatus = document.getElementById("register-request-status");
const registerVerifyStatus = document.getElementById("register-verify-status");
const loginRequestStatus = document.getElementById("login-request-status");
const loginVerifyStatus = document.getElementById("login-verify-status");
const setupStatus = document.getElementById("setup-status");
const sendStatus = document.getElementById("send-status");
const logoutButton = document.getElementById("logout-button");

const preview = document.getElementById("email-preview");
const detectedRecipients = document.getElementById("detected-recipients");
const mailPreviews = document.getElementById("mail-previews");
const historyList = document.getElementById("history-list");
const dashboardEmpty = document.getElementById("dashboard-empty");

const state = {
  authenticated: false,
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
  if (!state.authenticated || !state.user) {
    accountSummary.innerHTML = `
      <h2>Register Or Login</h2>
      <p class="small">Create your account or sign in with email OTP.</p>
    `;
    return;
  }

  const setupDone = Boolean(state.user.smtpAccount && state.user.senderProfile);
  accountSummary.innerHTML = `
    <h2>${escapeHtml(state.user.email)}</h2>
    <p>${setupDone ? "Your private setup is ready." : "Finish your private sender setup."}</p>
    <p>${state.user.senderProfile ? `Template: ${escapeHtml(state.user.senderProfile.domain)} / ${escapeHtml(state.user.senderProfile.templateKey)}` : "No template selected yet."}</p>
    <p>${state.user.history?.length || 0} mail batch${state.user.history?.length === 1 ? "" : "es"} in your dashboard</p>
  `;
}

function renderAuthShell() {
  authPanel.classList.toggle("hidden", state.authenticated);
  portalShell.classList.toggle("hidden", !state.authenticated);
  renderAccountSummary();
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
  if (!smtp && !profile) return;

  if (smtp) {
    setupForm.elements.host.value = smtp.host || "smtp.gmail.com";
    setupForm.elements.port.value = smtp.port || "465";
    setupForm.elements.user.value = smtp.user || "";
    setupForm.elements.secure.checked = Boolean(smtp.secure);
    setupForm.elements.tlsRejectUnauthorized.checked = smtp.tlsRejectUnauthorized !== false;
  }

  if (profile) {
    setupForm.elements.fromName.value = profile.fromName || "";
    setupForm.elements.fromEmail.value = profile.fromEmail || "";
    setupForm.elements.domain.value = profile.domain || "";
    renderTemplateOptions();
    setupForm.elements.templateKey.value = profile.templateKey || "";
    setupForm.elements.customSubject.value = profile.customSubject || "";
    setupForm.elements.customNote.value = profile.customNote || "";
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
  const history = state.user?.history || [];
  dashboardEmpty.classList.toggle("hidden", history.length > 0);
  historyList.innerHTML = "";

  history.forEach((entry) => {
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

async function refreshBootstrap() {
  const data = await requestJson("/api/bootstrap");
  state.authenticated = data.authenticated;
  state.user = data.user;
  state.templates = data.templates || {};
  renderAuthShell();
  if (state.authenticated) {
    fillSetupForm();
    renderHistory();
  } else {
    preview.textContent = "Paste emails to preview the generated mails.";
    renderDetectedRecipients([]);
    renderMailPreviews(null);
  }
}

async function refreshPreview() {
  if (!state.authenticated) {
    preview.textContent = "Login first.";
    renderDetectedRecipients([]);
    renderMailPreviews(null);
    return;
  }
  if (!state.user?.smtpAccount || !state.user?.senderProfile) {
    preview.textContent = "Complete your sender setup first.";
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

async function handleOtpRequest(form, statusEl, mode, verifyForm) {
  setStatus(statusEl, `Sending ${mode} OTP...`, "info");
  try {
    const email = form.elements.email.value;
    const data = await requestJson("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, mode })
    });
    verifyForm.elements.email.value = email;
    const suffix = data.devOtp ? ` Dev OTP: ${data.devOtp}` : "";
    setStatus(statusEl, `OTP sent.${suffix}`, "success");
  } catch (error) {
    setStatus(statusEl, error.message, "error");
  }
}

async function handleOtpVerify(form, statusEl, mode, successText) {
  setStatus(statusEl, `${successText}...`, "info");
  try {
    await requestJson("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.elements.email.value,
        otp: form.elements.otp.value,
        mode
      })
    });
    setStatus(statusEl, mode === "register" ? "Account created successfully." : "Login successful.", "success");
    await refreshBootstrap();
  } catch (error) {
    setStatus(statusEl, error.message, "error");
  }
}

registerRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleOtpRequest(registerRequestForm, registerRequestStatus, "register", registerVerifyForm);
});

loginRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleOtpRequest(loginRequestForm, loginRequestStatus, "login", loginVerifyForm);
});

registerVerifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleOtpVerify(registerVerifyForm, registerVerifyStatus, "register", "Creating account");
});

loginVerifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleOtpVerify(loginVerifyForm, loginVerifyStatus, "login", "Logging in");
});

setupForm.elements.domain.addEventListener("change", renderTemplateOptions);

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(setupStatus, "Saving your setup...", "info");

  try {
    const data = await requestJson("/api/user/setup", {
      method: "POST",
      body: new FormData(setupForm)
    });
    state.user = data.user;
    renderAccountSummary();
    renderHistory();
    setStatus(setupStatus, "Your setup is saved.", "success");
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

logoutButton.addEventListener("click", async () => {
  await requestJson("/api/auth/logout", { method: "POST" }).catch(() => null);
  state.authenticated = false;
  state.user = null;
  renderAuthShell();
});

refreshBootstrap().catch((error) => {
  accountSummary.textContent = error.message || "Unable to load portal.";
});
