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
const SESSION_COOKIE = "mail_portal_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const OTP_TTL_MS = 1000 * 60 * 10;
const OTP_MAX_ATTEMPTS = 5;
const MAX_HISTORY_ITEMS = 200;
const MAX_RECIPIENTS = 50;
const MAX_TEXT_LEN = 2000;
const STORE_PREFIX = "mail_portal";
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

const memoryDb = {
  kv: new Map()
};

function trimToString(value) {
  return String(value || "").trim();
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

async function kvClient() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    return require("@vercel/kv").kv;
  } catch {
    return null;
  }
}

function key(name) {
  return `${STORE_PREFIX}:${name}`;
}

async function storeGet(name) {
  const kv = await kvClient();
  if (kv) return (await kv.get(key(name))) || null;
  return memoryDb.kv.get(key(name)) || null;
}

async function storeSet(name, value) {
  const kv = await kvClient();
  if (kv) {
    await kv.set(key(name), value);
    return;
  }
  memoryDb.kv.set(key(name), value);
}

async function storeDelete(name) {
  const kv = await kvClient();
  if (kv) {
    await kv.del(key(name));
    return;
  }
  memoryDb.kv.delete(key(name));
}

function publicTemplates() {
  return Object.fromEntries(
    Object.entries(templates).map(([domain, variants]) => [
      domain,
      Object.entries(variants).map(([variantKey, template]) => ({
        key: variantKey,
        label: template.label,
        subject: template.subject
      }))
    ])
  );
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

function otpTransportConfig() {
  const host = trimToString(process.env.OTP_SMTP_HOST);
  const user = trimToString(process.env.OTP_SMTP_USER);
  const pass = trimToString(process.env.OTP_SMTP_PASS);
  const from = trimToString(process.env.OTP_FROM_EMAIL);
  const port = Number(process.env.OTP_SMTP_PORT || 465);

  if (!host || !user || !pass || !from || !Number.isInteger(port)) return null;
  return {
    smtp: {
      host,
      port,
      secure: String(process.env.OTP_SMTP_SECURE || "true") !== "false",
      user,
      pass,
      tlsRejectUnauthorized: String(process.env.OTP_SMTP_TLS_REJECT_UNAUTHORIZED || "true") !== "false"
    },
    from
  };
}

async function sendOtpEmail(email, otp) {
  const config = otpTransportConfig();
  if (!config) {
    if (NODE_ENV !== "production") return { devOtp: otp };
    throw new Error("OTP mail transport is not configured.");
  }

  const transport = buildTransport(config.smtp);
  await transport.sendMail({
    from: config.from,
    to: email,
    subject: "Your login OTP",
    text: `Your OTP is ${otp}. It expires in 10 minutes.`
  });
  return { delivered: true };
}

function hashOtp(email, otp) {
  return crypto.createHash("sha256").update(`${email}:${otp}`).digest("hex");
}

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function findUserByEmail(email) {
  const id = await storeGet(`user-email:${email}`);
  if (!id) return null;
  return storeGet(`user:${id}`);
}

async function saveUser(user) {
  await storeSet(`user:${user.id}`, user);
  await storeSet(`user-email:${user.email}`, user.id);
  return user;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    senderProfile: user.senderProfile
      ? {
          fromName: user.senderProfile.fromName,
          fromEmail: user.senderProfile.fromEmail,
          resumeFileName: user.senderProfile.resumeFileName,
          domain: user.senderProfile.domain,
          templateKey: user.senderProfile.templateKey,
          customSubject: user.senderProfile.customSubject,
          customNote: user.senderProfile.customNote
        }
      : null,
    smtpAccount: user.smtpAccount
      ? {
          host: user.smtpAccount.host,
          port: user.smtpAccount.port,
          secure: user.smtpAccount.secure,
          user: user.smtpAccount.user,
          tlsRejectUnauthorized: user.smtpAccount.tlsRejectUnauthorized
        }
      : null,
    history: Array.isArray(user.history) ? user.history : []
  };
}

async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await storeGet(`session:${token}`);
  if (!session || session.expiresAt < Date.now()) {
    if (token) await storeDelete(`session:${token}`);
    return null;
  }
  const user = await storeGet(`user:${session.userId}`);
  if (!user) {
    await storeDelete(`session:${token}`);
    return null;
  }
  return { user, token };
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

function validateSenderProfile(body, file) {
  const fromName = trimToString(body?.fromName);
  const fromEmail = trimToString(body?.fromEmail);
  const domain = trimToString(body?.domain);
  const templateKey = trimToString(body?.templateKey);
  const customSubject = trimToString(body?.customSubject);
  const customNote = trimToString(body?.customNote);
  if (!fromName || !fromEmail) return { error: "Provide sender name and sender email." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) return { error: "Provide a valid sender email." };
  if (!templates[domain]?.[templateKey]) return { error: "Select a valid profile and template." };
  if (customSubject.length > MAX_TEXT_LEN || customNote.length > MAX_TEXT_LEN) return { error: "Subject or note is too long." };
  if (!file) return { error: "Upload a resume file." };
  return {
    value: {
      fromName,
      fromEmail,
      domain,
      templateKey,
      customSubject,
      customNote,
      resumeFileName: file.originalname,
      resumeMimeType: file.mimetype || "application/octet-stream",
      resumeBufferBase64: file.buffer.toString("base64")
    }
  };
}

function buildMessages(user, recipientText) {
  const recipients = extractRecipients(recipientText);
  const template = templates[user.senderProfile.domain][user.senderProfile.templateKey];
  const subject = user.senderProfile.customSubject || template.subject;
  const messages = recipients.map((recipient) => {
    const body = template.body({
      greeting: buildGreeting(recipient, recipients.length),
      name: user.senderProfile.fromName,
      resumeText: `Attached resume: ${user.senderProfile.resumeFileName}`
    });
    const content = user.senderProfile.customNote ? `${body}\n\nAdditional Note:\n${user.senderProfile.customNote}` : body;
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
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", async (_req, res) => {
  const useKv = Boolean(await kvClient());
  res.json({ ok: true, storage: useKv ? "kv" : "memory" });
});

app.get("/api/bootstrap", async (req, res, next) => {
  try {
    const session = await getSessionUser(req);
    res.json({
      authenticated: Boolean(session),
      user: session ? sanitizeUser(session.user) : null,
      templates: publicTemplates()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/request-otp", async (req, res, next) => {
  try {
    const email = trimToString(req.body?.email).toLowerCase();
    const mode = trimToString(req.body?.mode).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Provide a valid email address." });
    }
    if (!["login", "register"].includes(mode)) {
      return res.status(400).json({ error: "Invalid auth mode." });
    }

    const existingUser = await findUserByEmail(email);
    if (mode === "register" && existingUser) {
      return res.status(400).json({ error: "An account already exists for this email. Use login." });
    }
    if (mode === "login" && !existingUser) {
      return res.status(400).json({ error: "No account found for this email. Register first." });
    }

    const otp = randomOtp();
    await storeSet(`otp:${email}`, {
      email,
      mode,
      otpHash: hashOtp(email, otp),
      attempts: 0,
      expiresAt: Date.now() + OTP_TTL_MS
    });

    const delivery = await sendOtpEmail(email, otp);
    res.json({
      ok: true,
      message: "OTP sent to your email.",
      devOtp: delivery.devOtp
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/verify-otp", async (req, res, next) => {
  try {
    const email = trimToString(req.body?.email).toLowerCase();
    const otp = trimToString(req.body?.otp);
    const mode = trimToString(req.body?.mode).toLowerCase();
    const record = await storeGet(`otp:${email}`);
    if (!record || record.expiresAt < Date.now()) {
      await storeDelete(`otp:${email}`);
      return res.status(400).json({ error: "OTP expired. Request a new one." });
    }
    if (record.mode !== mode) {
      return res.status(400).json({ error: "OTP mode mismatch. Request a new OTP." });
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await storeDelete(`otp:${email}`);
      return res.status(400).json({ error: "Too many OTP attempts. Request a new one." });
    }
    if (record.otpHash !== hashOtp(email, otp)) {
      record.attempts += 1;
      await storeSet(`otp:${email}`, record);
      return res.status(400).json({ error: "Incorrect OTP." });
    }

    await storeDelete(`otp:${email}`);

    let user = await findUserByEmail(email);
    if (mode === "register") {
      if (user) {
        return res.status(400).json({ error: "Account already exists. Use login." });
      }
      user = {
        id: crypto.randomUUID(),
        email,
        createdAt: new Date().toISOString(),
        smtpAccount: null,
        senderProfile: null,
        history: []
      };
      await saveUser(user);
    } else if (!user) {
      return res.status(400).json({ error: "No account found. Register first." });
    }

    const token = newSessionToken();
    await storeSet(`session:${token}`, {
      userId: user.id,
      email: user.email,
      expiresAt: Date.now() + SESSION_TTL_MS
    });

    const secure = NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
    res.json({ ok: true, user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    if (token) await storeDelete(`session:${token}`);
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/user/setup/verify-smtp", async (req, res, next) => {
  try {
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ error: "Login required." });
    const validation = validateSmtpPayload(req.body?.smtp);
    if (validation.error) return res.status(400).json({ error: validation.error });
    await buildTransport(validation.value).verify();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/user/setup", upload.single("resumeFile"), async (req, res, next) => {
  try {
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ error: "Login required." });

    const smtpValidation = validateSmtpPayload(req.body);
    if (smtpValidation.error) return res.status(400).json({ error: smtpValidation.error });
    const profileValidation = validateSenderProfile(req.body, req.file);
    if (profileValidation.error) return res.status(400).json({ error: profileValidation.error });

    await buildTransport(smtpValidation.value).verify();

    const updatedUser = {
      ...session.user,
      smtpAccount: smtpValidation.value,
      senderProfile: profileValidation.value
    };
    await saveUser(updatedUser);
    res.json({ ok: true, user: sanitizeUser(updatedUser) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/user/send/preview", async (req, res, next) => {
  try {
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ error: "Login required." });
    if (!session.user.smtpAccount || !session.user.senderProfile) {
      return res.status(400).json({ error: "Complete your sender setup first." });
    }

    const recipientText = trimToString(req.body?.recipientText);
    const preview = buildMessages(session.user, recipientText);
    if (!preview.recipients.length) {
      return res.status(400).json({ error: "Paste at least one valid email address." });
    }
    res.json({ ok: true, ...preview });
  } catch (error) {
    next(error);
  }
});

app.post("/api/user/send", async (req, res, next) => {
  try {
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ error: "Login required." });
    if (!session.user.smtpAccount || !session.user.senderProfile) {
      return res.status(400).json({ error: "Complete your sender setup first." });
    }

    const recipientText = trimToString(req.body?.recipientText);
    const built = buildMessages(session.user, recipientText);
    if (!built.recipients.length) {
      return res.status(400).json({ error: "Paste at least one valid email address." });
    }

    const transport = buildTransport(session.user.smtpAccount);
    const sentMessages = [];
    for (const message of built.messages) {
      const info = await transport.sendMail({
        from: `${session.user.senderProfile.fromName} <${session.user.senderProfile.fromEmail}>`,
        to: message.recipient.email,
        subject: message.subject,
        text: message.content,
        attachments: [
          {
            filename: session.user.senderProfile.resumeFileName,
            content: Buffer.from(session.user.senderProfile.resumeBufferBase64, "base64"),
            contentType: session.user.senderProfile.resumeMimeType
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

    const updatedUser = {
      ...session.user,
      history: [
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          subject: built.subject,
          recipients: built.recipients.map((recipient) => recipient.email),
          sentMessages
        },
        ...(session.user.history || [])
      ].slice(0, MAX_HISTORY_ITEMS)
    };

    await saveUser(updatedUser);
    res.json({ ok: true, sent: sentMessages.length, user: sanitizeUser(updatedUser) });
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
