const fs = require("fs");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const STATE_DIR = path.join(__dirname, "app-data");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const MAX_HISTORY_ITEMS = 200;
const MAX_RECIPIENTS = 50;
const MAX_TEXT_LEN = 2000;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);

const templates = {
  marketing: {
    fresher_campaign: {
      label: "Campaign starter",
      subject: "Application for Marketing Associate",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher eager to begin my career in marketing. I enjoy shaping clear messaging, supporting campaign execution, and learning quickly in fast-moving teams.\n\nHighlights:\n- Strong interest in content, brand communication, and audience research\n- Comfortable with coordination, writing, and structured execution\n- Ready to contribute with energy and consistency from day one\n\nResume:\n${resumeText}\n\nThank you for your time. I would value the opportunity to speak about any suitable marketing openings.\n\nBest regards,\n${name}`
    },
    fresher_growth: {
      label: "Growth-focused",
      subject: "Fresher Marketing Application for Growth-Focused Roles",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher interested in marketing roles with a strong growth and performance focus. I am motivated by experimentation, digital channels, and measurable business impact.\n\nHighlights:\n- Interest in social media, campaign analysis, and lead generation\n- Analytical mindset with willingness to test, learn, and improve quickly\n- Strong ownership and follow-through on execution tasks\n\nResume:\n${resumeText}\n\nI would appreciate the chance to discuss how I can support your marketing team in an entry-level role.\n\nBest regards,\n${name}`
    },
    fresher_brand: {
      label: "Brand and content",
      subject: "Entry-Level Marketing Application",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher seeking an opportunity to start my marketing career. I am especially interested in brand building, content planning, and customer-focused communication.\n\nHighlights:\n- Strong written communication and creative problem-solving skills\n- Interest in campaign planning, storytelling, and cross-team collaboration\n- Adaptable, proactive, and committed to continuous learning\n\nResume:\n${resumeText}\n\nPlease consider my profile for relevant fresher marketing roles. I would be glad to connect.\n\nBest regards,\n${name}`
    }
  },
  hr: {
    fresher_people_ops: {
      label: "People operations",
      subject: "Application for HR Associate Role",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher looking to begin my career in HR. I am interested in people operations, employee support, and building strong workplace experiences.\n\nHighlights:\n- Strong communication, coordination, and organizational skills\n- Interest in onboarding, employee engagement, and HR processes\n- Reliable, empathetic, and eager to learn from structured HR teams\n\nResume:\n${resumeText}\n\nThank you for your time. I would welcome the opportunity to discuss any entry-level HR openings.\n\nBest regards,\n${name}`
    },
    fresher_talent: {
      label: "Talent acquisition",
      subject: "Fresher Application for Talent Acquisition / HR Roles",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher interested in HR roles, especially in recruitment and talent coordination. I am keen to contribute to candidate experience and hiring operations.\n\nHighlights:\n- Interest in recruitment workflow, screening coordination, and candidate communication\n- Strong interpersonal skills with an organized and process-oriented approach\n- Quick learner ready to support hiring teams effectively\n\nResume:\n${resumeText}\n\nI would appreciate the opportunity to be considered for fresher HR or talent acquisition openings.\n\nBest regards,\n${name}`
    },
    fresher_generalist: {
      label: "HR generalist",
      subject: "Entry-Level HR Application",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher seeking to start my career in human resources. I am motivated by the chance to support employees, improve coordination, and contribute to strong internal processes.\n\nHighlights:\n- Good communication, documentation, and stakeholder coordination skills\n- Interest in policy support, onboarding, and employee engagement activities\n- Dependable and eager to grow within an HR generalist role\n\nResume:\n${resumeText}\n\nPlease consider my profile for suitable entry-level HR opportunities. I would be glad to connect.\n\nBest regards,\n${name}`
    }
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_RESUME_TYPES.has(file.mimetype)) {
      return cb(new Error("Unsupported resume type. Use PDF, DOC, DOCX, or TXT."));
    }
    cb(null, true);
  }
});

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"]
      }
    }
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

function trimToString(value) {
  return String(value || "").trim();
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function defaultState() {
  return {
    configured: false,
    sender: null,
    history: []
  };
}

function loadState() {
  ensureStateDir();
  if (!fs.existsSync(STATE_FILE)) return defaultState();
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      configured: Boolean(parsed.configured),
      sender: parsed.sender || null,
      history: Array.isArray(parsed.history) ? parsed.history : []
    };
  } catch {
    return defaultState();
  }
}

let appState = loadState();

function saveState() {
  ensureStateDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(appState, null, 2));
}

function sanitizeState() {
  return {
    configured: appState.configured,
    sender: appState.sender
      ? {
          smtp: {
            host: appState.sender.smtp.host,
            port: appState.sender.smtp.port,
            secure: appState.sender.smtp.secure,
            user: appState.sender.smtp.user,
            tlsRejectUnauthorized: appState.sender.smtp.tlsRejectUnauthorized
          },
          profile: {
            fromName: appState.sender.profile.fromName,
            fromEmail: appState.sender.profile.fromEmail,
            resumeFileName: appState.sender.profile.resumeFileName,
            domain: appState.sender.profile.domain,
            templateKey: appState.sender.profile.templateKey,
            customSubject: appState.sender.profile.customSubject,
            customNote: appState.sender.profile.customNote
          }
        }
      : null,
    templates: Object.fromEntries(
      Object.entries(templates).map(([domain, variants]) => [
        domain,
        Object.entries(variants).map(([key, template]) => ({
          key,
          label: template.label,
          subject: template.subject
        }))
      ])
    ),
    history: appState.history
  };
}

function inferRecipientName(email) {
  const localPart = email.split("@")[0] || "";
  const ignored = new Set(["hr", "jobs", "careers", "career", "recruitment", "recruiter", "talent", "team", "hiring", "info", "admin", "contact"]);
  const tokens = localPart
    .split(/[._-]+/)
    .map((token) => token.replace(/\d+/g, "").trim())
    .filter(Boolean)
    .filter((token) => !ignored.has(token.toLowerCase()));
  if (!tokens.length) return null;
  return tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()).join(" ");
}

function extractRecipients(raw) {
  const matches = String(raw || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const recipients = [];
  const seen = new Set();
  for (const email of matches) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push({ email: normalized, name: inferRecipientName(normalized) });
    if (recipients.length >= MAX_RECIPIENTS) break;
  }
  return recipients;
}

function buildGreeting(recipient, total) {
  if (recipient?.name) return `Hello ${recipient.name},`;
  return total > 1 ? "Hello Hiring Team," : "Hello Hiring Manager,";
}

function buildTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: Boolean(smtp.secure) || Number(smtp.port) === 465,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: smtp.tlsRejectUnauthorized === false ? { rejectUnauthorized: false } : undefined
  });
}

function validateSmtp(smtp) {
  const host = trimToString(smtp?.host);
  const user = trimToString(smtp?.user);
  const pass = trimToString(smtp?.pass);
  const port = Number(smtp?.port);
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "Provide valid SMTP host, port, username, and password." };
  }
  return {
    value: {
      host,
      port,
      secure: Boolean(smtp?.secure),
      user,
      pass,
      tlsRejectUnauthorized: smtp?.tlsRejectUnauthorized !== false
    }
  };
}

function validateSetup(body, file) {
  const fromName = trimToString(body?.fromName);
  const fromEmail = trimToString(body?.fromEmail);
  const domain = trimToString(body?.domain);
  const templateKey = trimToString(body?.templateKey);
  const customSubject = trimToString(body?.customSubject);
  const customNote = trimToString(body?.customNote);

  if (!fromName || !fromEmail) return { error: "Provide sender name and sender email." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) return { error: "Provide a valid sender email." };
  if (!templates[domain]?.[templateKey]) return { error: "Select a valid default profile and template." };
  if (customSubject.length > MAX_TEXT_LEN || customNote.length > MAX_TEXT_LEN) return { error: "Default subject/note is too long." };
  if (!file) return { error: "Upload a resume file." };

  return {
    value: {
      fromName,
      fromEmail,
      domain,
      templateKey,
      customSubject,
      customNote
    }
  };
}

function requireConfigured(res, predicate = appState.configured) {
  if (!predicate || !appState.sender) {
    res.status(400).json({ error: "Complete one-time setup first." });
    return false;
  }
  return true;
}

function buildMessages(recipientText) {
  const recipients = extractRecipients(recipientText);
  const sender = appState.sender;
  const template = templates[sender.profile.domain][sender.profile.templateKey];
  const subject = sender.profile.customSubject || template.subject;

  const messages = recipients.map((recipient) => {
    const body = template.body({
      greeting: buildGreeting(recipient, recipients.length),
      name: sender.profile.fromName,
      resumeText: `Attached resume: ${sender.profile.resumeFileName}`
    });
    const content = sender.profile.customNote ? `${body}\n\nAdditional Note:\n${sender.profile.customNote}` : body;
    return { recipient, subject, content };
  });

  return { recipients, subject, messages };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/state", (_req, res) => {
  res.json(sanitizeState());
});

app.post("/api/setup/verify", async (req, res, next) => {
  try {
    const validation = validateSmtp(req.body?.smtp);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const transport = buildTransport(validation.value);
    await transport.verify();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/setup", upload.single("resumeFile"), async (req, res, next) => {
  try {
    const smtpValidation = validateSmtp(req.body);
    if (smtpValidation.error) return res.status(400).json({ error: smtpValidation.error });
    const setupValidation = validateSetup(req.body, req.file);
    if (setupValidation.error) return res.status(400).json({ error: setupValidation.error });

    const transport = buildTransport(smtpValidation.value);
    await transport.verify();

    appState.configured = true;
    appState.sender = {
      smtp: smtpValidation.value,
      profile: {
        fromName: setupValidation.value.fromName,
        fromEmail: setupValidation.value.fromEmail,
        domain: setupValidation.value.domain,
        templateKey: setupValidation.value.templateKey,
        customSubject: setupValidation.value.customSubject,
        customNote: setupValidation.value.customNote,
        resumeFileName: req.file.originalname,
        resumeMimeType: req.file.mimetype || "application/octet-stream",
        resumeBufferBase64: req.file.buffer.toString("base64")
      }
    };
    saveState();
    res.json({ ok: true, state: sanitizeState() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/send/preview", (req, res) => {
  if (!requireConfigured(res)) return;
  const recipientText = trimToString(req.body?.recipientText);
  const recipients = extractRecipients(recipientText);
  if (!recipients.length) return res.status(400).json({ error: "Paste at least one valid email address." });
  const preview = buildMessages(recipientText);
  res.json({ ok: true, ...preview });
});

app.post("/api/send", async (req, res, next) => {
  try {
    if (!requireConfigured(res)) return;
    const recipientText = trimToString(req.body?.recipientText);
    const built = buildMessages(recipientText);
    if (!built.recipients.length) return res.status(400).json({ error: "Paste at least one valid email address." });

    const sender = appState.sender;
    const transport = buildTransport(sender.smtp);
    const sentMessages = [];

    for (const message of built.messages) {
      const info = await transport.sendMail({
        from: `${sender.profile.fromName} <${sender.profile.fromEmail}>`,
        to: message.recipient.email,
        subject: message.subject,
        text: message.content,
        attachments: [
          {
            filename: sender.profile.resumeFileName,
            content: Buffer.from(sender.profile.resumeBufferBase64, "base64"),
            contentType: sender.profile.resumeMimeType
          }
        ]
      });

      sentMessages.push({
        messageId: info.messageId,
        recipient: message.recipient.email,
        recipientName: message.recipient.name,
        content: message.content
      });
    }

    appState.history.unshift({
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      subject: built.subject,
      recipients: built.recipients.map((recipient) => recipient.email),
      sentMessages
    });
    appState.history = appState.history.slice(0, MAX_HISTORY_ITEMS);
    saveState();

    res.json({ ok: true, sent: sentMessages.length, history: appState.history });
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  if (err?.message) return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: "Internal server error." });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
