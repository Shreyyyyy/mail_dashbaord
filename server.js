const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_HISTORY_ITEMS = 200;
const MAX_RECIPIENTS = 50;
const MAX_TEXT_LEN = 2000;
const STORE_KEY = "mail_app_state_v1";
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

const memoryStore = { configured: false, sender: null, history: [] };

function trimToString(value) {
  return String(value || "").trim();
}

function cloneDefaultState() {
  return { configured: false, sender: null, history: [] };
}

async function loadKvModule() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    return require("@vercel/kv");
  } catch {
    return null;
  }
}

async function readState() {
  const kv = await loadKvModule();
  if (kv?.kv) {
    const state = await kv.kv.get(STORE_KEY);
    return state || cloneDefaultState();
  }
  return memoryStore;
}

async function writeState(nextState) {
  const kv = await loadKvModule();
  if (kv?.kv) {
    await kv.kv.set(STORE_KEY, nextState);
    return nextState;
  }
  memoryStore.configured = nextState.configured;
  memoryStore.sender = nextState.sender;
  memoryStore.history = nextState.history;
  return memoryStore;
}

function publicTemplates() {
  return Object.fromEntries(
    Object.entries(templates).map(([domain, variants]) => [
      domain,
      Object.entries(variants).map(([key, template]) => ({
        key,
        label: template.label,
        subject: template.subject
      }))
    ])
  );
}

function sanitizeState(state) {
  return {
    configured: Boolean(state.configured),
    sender: state.sender
      ? {
          smtp: {
            host: state.sender.smtp.host,
            port: state.sender.smtp.port,
            secure: state.sender.smtp.secure,
            user: state.sender.smtp.user,
            tlsRejectUnauthorized: state.sender.smtp.tlsRejectUnauthorized
          },
          profile: {
            fromName: state.sender.profile.fromName,
            fromEmail: state.sender.profile.fromEmail,
            resumeFileName: state.sender.profile.resumeFileName,
            domain: state.sender.profile.domain,
            templateKey: state.sender.profile.templateKey,
            customSubject: state.sender.profile.customSubject,
            customNote: state.sender.profile.customNote
          }
        }
      : null,
    templates: publicTemplates(),
    history: Array.isArray(state.history) ? state.history : []
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
  return { value: { fromName, fromEmail, domain, templateKey, customSubject, customNote } };
}

function buildMessages(sender, recipientText) {
  const recipients = extractRecipients(recipientText);
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
app.use(express.static("public", { extensions: ["html"] }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, storage: process.env.KV_REST_API_URL ? "kv" : "memory" });
});

app.get("/api/state", async (_req, res, next) => {
  try {
    const state = await readState();
    res.json(sanitizeState(state));
  } catch (error) {
    next(error);
  }
});

app.post("/api/setup/verify", async (req, res, next) => {
  try {
    const validation = validateSmtp(req.body?.smtp);
    if (validation.error) return res.status(400).json({ error: validation.error });
    await buildTransport(validation.value).verify();
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

    await buildTransport(smtpValidation.value).verify();

    const nextState = {
      configured: true,
      sender: {
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
      },
      history: (await readState()).history || []
    };

    const state = await writeState(nextState);
    res.json({ ok: true, state: sanitizeState(state) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/send/preview", async (req, res, next) => {
  try {
    const state = await readState();
    if (!state.configured || !state.sender) return res.status(400).json({ error: "Complete one-time setup first." });
    const recipientText = trimToString(req.body?.recipientText);
    const preview = buildMessages(state.sender, recipientText);
    if (!preview.recipients.length) return res.status(400).json({ error: "Paste at least one valid email address." });
    res.json({ ok: true, ...preview });
  } catch (error) {
    next(error);
  }
});

app.post("/api/send", async (req, res, next) => {
  try {
    const state = await readState();
    if (!state.configured || !state.sender) return res.status(400).json({ error: "Complete one-time setup first." });
    const recipientText = trimToString(req.body?.recipientText);
    const built = buildMessages(state.sender, recipientText);
    if (!built.recipients.length) return res.status(400).json({ error: "Paste at least one valid email address." });

    const transport = buildTransport(state.sender.smtp);
    const sentMessages = [];
    for (const message of built.messages) {
      const info = await transport.sendMail({
        from: `${state.sender.profile.fromName} <${state.sender.profile.fromEmail}>`,
        to: message.recipient.email,
        subject: message.subject,
        text: message.content,
        attachments: [
          {
            filename: state.sender.profile.resumeFileName,
            content: Buffer.from(state.sender.profile.resumeBufferBase64, "base64"),
            contentType: state.sender.profile.resumeMimeType
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

    const nextState = {
      ...state,
      history: [
        {
          id: `${Date.now()}`,
          createdAt: new Date().toISOString(),
          subject: built.subject,
          recipients: built.recipients.map((recipient) => recipient.email),
          sentMessages
        },
        ...(state.history || [])
      ].slice(0, MAX_HISTORY_ITEMS)
    };

    const savedState = await writeState(nextState);
    res.json({ ok: true, sent: sentMessages.length, history: savedState.history });
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  if (err?.message) return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: "Internal server error." });
});

if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
}

module.exports = app;
