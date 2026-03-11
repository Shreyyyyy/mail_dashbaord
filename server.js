const crypto = require("crypto");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const NODE_ENV = process.env.NODE_ENV || "development";
const SESSION_COOKIE = "resume_mailer_sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const MAX_HISTORY_ITEMS = 100;
const MAX_RECIPIENTS = 50;
const MAX_CUSTOM_SUBJECT = 180;
const MAX_CUSTOM_NOTE = 2000;
const JSON_LIMIT = "1mb";
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
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_RESUME_TYPES.has(file.mimetype)) {
      callback(new Error("Unsupported resume type. Use PDF, DOC, DOCX, or TXT."));
      return;
    }
    callback(null, true);
  }
});

const sessionStore = new Map();

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"]
      }
    }
  })
);
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

function trimToString(value) {
  return String(value || "").trim();
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((cookies, part) => {
    const [key, ...value] = part.trim().split("=");
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(value.join("="));
    return cookies;
  }, {});
}

function pruneSessions() {
  const now = Date.now();
  for (const [sid, session] of sessionStore.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessionStore.delete(sid);
    }
  }
}

function createSession() {
  return {
    smtp: null,
    resume: null,
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function getSession(req, res) {
  pruneSessions();
  const cookies = parseCookies(req);
  let sid = cookies[SESSION_COOKIE];

  if (!sid || !sessionStore.has(sid)) {
    sid = crypto.randomUUID();
    sessionStore.set(sid, createSession());
    const secure = NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax${secure}`);
  }

  const session = sessionStore.get(sid);
  session.updatedAt = Date.now();
  return session;
}

function inferRecipientName(email) {
  const localPart = email.split("@")[0] || "";
  const ignored = new Set(["hr", "jobs", "careers", "career", "recruitment", "recruiter", "talent", "team", "hiring", "info", "admin", "contact"]);
  const tokens = localPart
    .split(/[._-]+/)
    .map((token) => token.replace(/\d+/g, "").trim())
    .filter(Boolean)
    .filter((token) => !ignored.has(token.toLowerCase()));

  if (tokens.length === 0) return null;
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
    recipients.push({
      email: normalized,
      name: inferRecipientName(normalized)
    });
    if (recipients.length >= MAX_RECIPIENTS) break;
  }

  return recipients;
}

function buildGreeting(recipient, recipientCount) {
  if (recipient?.name) return `Hello ${recipient.name},`;
  if (recipientCount > 1) return "Hello Hiring Team,";
  return "Hello Hiring Manager,";
}

function buildTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: Boolean(smtp.secure) || Number(smtp.port) === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    },
    tls: smtp.tlsRejectUnauthorized === false ? { rejectUnauthorized: false } : undefined
  });
}

function sanitizeSmtp(smtp) {
  if (!smtp) return null;
  return {
    host: smtp.host,
    port: smtp.port,
    secure: Boolean(smtp.secure),
    user: smtp.user,
    tlsRejectUnauthorized: smtp.tlsRejectUnauthorized !== false
  };
}

function sanitizeResume(resume) {
  if (!resume) return null;
  return {
    fromName: resume.fromName,
    fromEmail: resume.fromEmail,
    hrEmails: resume.hrEmails,
    resumeFileName: resume.resumeFileName,
    resumeMimeType: resume.resumeMimeType,
    resumeSize: resume.resumeSize,
    recipientCount: extractRecipients(resume.hrEmails).length
  };
}

function buildTemplateOptions() {
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

function sanitizeHistoryEntry(entry) {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    domain: entry.domain,
    templateKey: entry.templateKey,
    recipients: entry.recipients,
    subject: entry.subject,
    content: entry.content,
    fromName: entry.fromName,
    fromEmail: entry.fromEmail,
    accepted: entry.accepted,
    sentMessages: entry.sentMessages
  };
}

function validateSmtpPayload(smtp) {
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

function validateResumePayload(body, file) {
  const fromName = trimToString(body?.fromName);
  const fromEmail = trimToString(body?.fromEmail);
  const hrEmails = trimToString(body?.hrEmails);

  if (!fromName || !fromEmail || !hrEmails) {
    return { error: "Provide sender name, sender email, and recipient text." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return { error: "Provide a valid sender email address." };
  }
  const recipients = extractRecipients(hrEmails);
  if (recipients.length === 0) {
    return { error: "No recipient emails were detected in the provided text." };
  }
  if (!file) {
    return { error: "Upload a resume file before saving." };
  }

  return {
    value: {
      fromName,
      fromEmail,
      hrEmails,
      recipients
    }
  };
}

function validateSendPayload(body) {
  const domain = trimToString(body?.domain);
  const templateKey = trimToString(body?.templateKey);
  const customSubject = trimToString(body?.customSubject);
  const customNote = trimToString(body?.customNote);

  if (!templates[domain]?.[templateKey]) {
    return { error: "Select a valid profile and template." };
  }
  if (customSubject.length > MAX_CUSTOM_SUBJECT) {
    return { error: `Custom subject must be ${MAX_CUSTOM_SUBJECT} characters or fewer.` };
  }
  if (customNote.length > MAX_CUSTOM_NOTE) {
    return { error: `Additional note must be ${MAX_CUSTOM_NOTE} characters or fewer.` };
  }

  return { value: { domain, templateKey, customSubject, customNote } };
}

function buildMessagePreview({ domain, templateKey, resume, customSubject = "", customNote = "" }) {
  const template = templates[domain][templateKey];
  const recipients = extractRecipients(resume.hrEmails);
  const subject = customSubject || template.subject;
  const messages = recipients.map((recipient) => {
    const body = template.body({
      greeting: buildGreeting(recipient, recipients.length),
      name: resume.fromName,
      resumeText: `Attached resume: ${resume.resumeFileName}`
    });
    const content = customNote ? `${body}\n\nAdditional Note:\n${customNote}` : body;
    return {
      recipient,
      subject,
      content
    };
  });

  return {
    subject,
    recipients,
    messages,
    firstPreview: messages[0]?.content || "No preview available."
  };
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get("/api/session", (req, res) => {
  const session = getSession(req, res);
  res.json({
    smtp: sanitizeSmtp(session.smtp),
    resume: sanitizeResume(session.resume),
    history: session.history.map(sanitizeHistoryEntry),
    templates: buildTemplateOptions()
  });
});

app.post("/api/verify", asyncHandler(async (req, res) => {
  const session = getSession(req, res);
  const validation = validateSmtpPayload(req.body?.smtp);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const transport = buildTransport(validation.value);
  await transport.verify();
  session.smtp = validation.value;

  res.json({ ok: true, smtp: sanitizeSmtp(session.smtp) });
}));

app.post("/api/resume", upload.single("resumeFile"), (req, res) => {
  const session = getSession(req, res);
  const validation = validateResumePayload(req.body, req.file);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  session.resume = {
    fromName: validation.value.fromName,
    fromEmail: validation.value.fromEmail,
    hrEmails: validation.value.hrEmails,
    resumeFileName: req.file.originalname,
    resumeMimeType: req.file.mimetype || "application/octet-stream",
    resumeSize: req.file.size,
    resumeBuffer: req.file.buffer
  };

  res.json({
    ok: true,
    resume: sanitizeResume(session.resume),
    recipients: validation.value.recipients
  });
});

app.post("/api/preview", (req, res) => {
  const session = getSession(req, res);
  if (!session.resume) {
    return res.status(400).json({ error: "Save resume details first." });
  }

  const validation = validateSendPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  res.json({
    ok: true,
    preview: buildMessagePreview({
      ...validation.value,
      resume: session.resume
    })
  });
});

app.post("/api/send", asyncHandler(async (req, res) => {
  const session = getSession(req, res);
  if (!session.smtp) {
    return res.status(400).json({ error: "Verify SMTP first." });
  }
  if (!session.resume) {
    return res.status(400).json({ error: "Save resume details first." });
  }

  const validation = validateSendPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const preview = buildMessagePreview({
    ...validation.value,
    resume: session.resume
  });
  if (preview.recipients.length === 0) {
    return res.status(400).json({ error: "No recipient emails were detected in the saved recipient text." });
  }

  const transport = buildTransport(session.smtp);
  const sentMessages = [];

  for (const message of preview.messages) {
    const info = await transport.sendMail({
      from: `${session.resume.fromName} <${session.resume.fromEmail}>`,
      to: message.recipient.email,
      subject: message.subject,
      text: message.content,
      attachments: [
        {
          filename: session.resume.resumeFileName,
          content: session.resume.resumeBuffer,
          contentType: session.resume.resumeMimeType
        }
      ]
    });

    sentMessages.push({
      messageId: info.messageId,
      accepted: info.accepted,
      recipient: message.recipient.email,
      recipientName: message.recipient.name,
      content: message.content
    });
  }

  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    domain: validation.value.domain,
    templateKey: validation.value.templateKey,
    recipients: preview.recipients.map((recipient) => recipient.email),
    subject: preview.subject,
    content: preview.firstPreview,
    fromName: session.resume.fromName,
    fromEmail: session.resume.fromEmail,
    accepted: sentMessages.flatMap((item) => item.accepted || []),
    sentMessages
  };

  session.history.unshift(entry);
  session.history = session.history.slice(0, MAX_HISTORY_ITEMS);

  res.json({
    ok: true,
    accepted: entry.accepted,
    entry: sanitizeHistoryEntry(entry)
  });
}));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err?.message) {
    const status = /SMTP|Invalid login|authentication|Unsupported resume type/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ error: status === 500 ? "Internal server error." : err.message });
  }
  return res.status(500).json({ error: "Internal server error." });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
