const crypto = require("crypto");
const path = require("path");
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
const STORE_PREFIX = "mail_portal";
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);

function compactLines(lines) {
  return lines.filter(Boolean).join("\n");
}

function buildRoleTemplate({ label, subject, intro, highlights, closing }) {
  return {
    label,
    subject,
    body: ({ greeting, resumeText }) =>
      compactLines([
        greeting,
        "",
        intro,
        "",
        "Highlights:",
        ...highlights.map((item) => `- ${item}`),
        "",
        `Resume:\n${resumeText}`,
        "",
        closing,
        "",
        "Best regards"
      ])
  };
}

const templates = {
  marketing: {
    fresher_campaign: {
      label: "Campaign starter",
      subject: "Application for Marketing Associate",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nThis email is to express interest in entry-level marketing opportunities. The focus is on clear messaging, campaign execution, audience research, and consistent support for fast-moving teams.\n\nHighlights:\n- Strong interest in content, brand communication, and audience research\n- Comfortable with coordination, writing, and structured execution\n- Ready to contribute with energy and consistency from day one\n\nResume:\n${resumeText}\n\nThank you for your time. Consider this profile for suitable marketing openings.\n\nBest regards`
    },
    fresher_growth: {
      label: "Growth-focused",
      subject: "Fresher Marketing Application for Growth-Focused Roles",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nThis email is to express interest in entry-level marketing roles with a growth and performance focus. The profile is aligned with experimentation, digital channels, and measurable business impact.\n\nHighlights:\n- Interest in social media, campaign analysis, and lead generation\n- Analytical mindset with willingness to test, learn, and improve quickly\n- Strong ownership and follow-through on execution tasks\n\nResume:\n${resumeText}\n\nThis profile can be considered for entry-level marketing opportunities.\n\nBest regards`
    },
    fresher_brand: {
      label: "Brand and content",
      subject: "Entry-Level Marketing Application",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nThis email is to express interest in entry-level marketing roles focused on brand building, content planning, and customer communication.\n\nHighlights:\n- Strong written communication and creative problem-solving skills\n- Interest in campaign planning, storytelling, and cross-team collaboration\n- Adaptable, proactive, and committed to continuous learning\n\nResume:\n${resumeText}\n\nPlease consider this profile for relevant fresher marketing roles.\n\nBest regards`
    }
  },
  hr: {
    fresher_people_ops: {
      label: "People operations",
      subject: "Application for HR Associate Role",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nThis email is to express interest in entry-level HR opportunities, especially in people operations, employee support, and workplace coordination.\n\nHighlights:\n- Strong communication, coordination, and organizational skills\n- Interest in onboarding, employee engagement, and HR processes\n- Reliable, empathetic, and eager to learn from structured HR teams\n\nResume:\n${resumeText}\n\nThank you for your time. Consider this profile for suitable HR openings.\n\nBest regards`
    },
    fresher_talent: {
      label: "Talent acquisition",
      subject: "Fresher Application for Talent Acquisition / HR Roles",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nThis email is to express interest in HR roles, especially in recruitment and talent coordination. The profile is suited to candidate communication and hiring operations support.\n\nHighlights:\n- Interest in recruitment workflow, screening coordination, and candidate communication\n- Strong interpersonal skills with an organized and process-oriented approach\n- Quick learner ready to support hiring teams effectively\n\nResume:\n${resumeText}\n\nPlease consider this profile for fresher HR or talent acquisition openings.\n\nBest regards`
    },
    fresher_generalist: {
      label: "HR generalist",
      subject: "Entry-Level HR Application",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nThis email is to express interest in entry-level HR opportunities with a focus on employee support, coordination, and strong internal processes.\n\nHighlights:\n- Good communication, documentation, and stakeholder coordination skills\n- Interest in policy support, onboarding, and employee engagement activities\n- Dependable and eager to grow within an HR generalist role\n\nResume:\n${resumeText}\n\nPlease consider this profile for suitable entry-level HR opportunities.\n\nBest regards`
    }
  },
  engineering: {
    ai_ml_engineer: buildRoleTemplate({
      label: "AI / ML engineer",
      subject: "Application for AI / ML Engineer Role",
      intro: "This email is to express interest in AI / ML engineer opportunities focused on practical machine learning systems, model-backed features, and measurable quality improvements.",
      highlights: [
        "Experience with ML workflows, model evaluation, and production-oriented problem solving",
        "Comfortable with Python, data pipelines, experimentation, and integrating models into applications",
        "Interested in applied AI work across LLM features, recommendation systems, forecasting, or predictive modeling"
      ],
      closing: "Please consider the attached profile for AI and machine learning opportunities aligned with your roadmap."
    }),
    full_stack_developer: buildRoleTemplate({
      label: "Full stack developer",
      subject: "Application for Full Stack Developer Role",
      intro: "This email is to express interest in full stack developer roles spanning backend services, frontend experiences, APIs, and deployment workflows.",
      highlights: [
        "Hands-on experience across UI development, server-side implementation, and database-backed applications",
        "Strong focus on shipping reliable features, debugging efficiently, and maintaining clean code",
        "Comfortable collaborating across product, design, and engineering to deliver production-ready systems"
      ],
      closing: "Please consider the attached profile for full stack opportunities where strong ownership and product-minded engineering are valued."
    }),
    frontend_developer: buildRoleTemplate({
      label: "Frontend developer",
      subject: "Application for Frontend Developer Role",
      intro: "This email is to express interest in frontend developer roles focused on responsive, accessible, and high-quality interfaces with strong attention to performance and usability.",
      highlights: [
        "Experience turning product requirements into polished web experiences",
        "Comfortable with modern JavaScript frameworks, state management, and API integration",
        "Strong interest in UI quality, performance tuning, and maintainable component systems"
      ],
      closing: "Please consider the attached profile for frontend teams building thoughtful user-facing products."
    }),
    backend_developer: buildRoleTemplate({
      label: "Backend developer",
      subject: "Application for Backend Developer Role",
      intro: "This email is to express interest in backend developer roles focused on API design, reliable services, and systems that scale cleanly under product demands.",
      highlights: [
        "Experience with backend application logic, databases, integrations, and service reliability",
        "Comfortable with performance tuning, debugging, and maintainable service design",
        "Strong interest in clean architecture, data correctness, and production operations"
      ],
      closing: "Please consider the attached profile for backend engineering opportunities where reliability and implementation quality matter."
    }),
    data_engineer: buildRoleTemplate({
      label: "Data engineer",
      subject: "Application for Data Engineer Role",
      intro: "This email is to express interest in data engineer roles focused on dependable pipelines, clean data models, and systems that help teams trust and use data effectively.",
      highlights: [
        "Experience with ETL or ELT workflows, data transformation, and pipeline reliability",
        "Comfortable working with SQL, Python, warehousing concepts, and automation",
        "Interested in building scalable data foundations for analytics and machine learning use cases"
      ],
      closing: "Please consider the attached profile for data engineering opportunities aligned with platform quality and business impact."
    }),
    devops_engineer: buildRoleTemplate({
      label: "DevOps / platform engineer",
      subject: "Application for DevOps / Platform Engineer Role",
      intro: "This email is to express interest in DevOps and platform engineering roles focused on delivery workflows, infrastructure reliability, and developer productivity.",
      highlights: [
        "Experience with CI/CD, deployment automation, observability, and infrastructure workflows",
        "Comfortable with cloud services, containers, scripting, and operational debugging",
        "Strong focus on reliability, automation, and reducing friction in engineering systems"
      ],
      closing: "Please consider the attached profile for DevOps or platform engineering roles where operational excellence and automation are important."
    }),
    qa_engineer: buildRoleTemplate({
      label: "QA / SDET",
      subject: "Application for QA Engineer / SDET Role",
      intro: "This email is to express interest in QA engineer and SDET roles focused on product quality through structured testing, automation, and defect analysis.",
      highlights: [
        "Experience with test planning, bug investigation, and automation-driven quality workflows",
        "Comfortable validating APIs, UI behavior, regression coverage, and release readiness",
        "Strong attention to detail with a practical mindset around product risk reduction"
      ],
      closing: "Please consider the attached profile for teams that value strong quality engineering practices."
    })
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

function extractRecipients(raw) {
  const matches = String(raw || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const recipients = [];
  const seen = new Set();
  for (const email of matches) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push({ email: normalized });
    if (recipients.length >= MAX_RECIPIENTS) break;
  }
  return recipients;
}

function buildGreeting(_recipient, total) {
  return total > 1 ? "Hello Hiring Team," : "Hello Hiring Manager,";
}

function buildTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: Boolean(smtp.secure) || Number(smtp.port) === 465,
    family: 4,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: smtp.tlsRejectUnauthorized === false ? { rejectUnauthorized: false } : undefined
  });
}

async function getAppState() {
  return (
    (await storeGet("app-state")) || {
      smtpAccount: null,
      senderProfile: null,
      history: []
    }
  );
}

async function saveAppState(nextState) {
  const current = await getAppState();
  const merged = { ...current, ...nextState };
  await storeSet("app-state", merged);
  return merged;
}

function sanitizeState(state) {
  return {
    smtpAccount: state.smtpAccount
      ? {
          host: state.smtpAccount.host,
          port: state.smtpAccount.port,
          secure: state.smtpAccount.secure,
          user: state.smtpAccount.user,
          tlsRejectUnauthorized: state.smtpAccount.tlsRejectUnauthorized
        }
      : null,
    senderProfile: state.senderProfile
      ? {
          resumeFileName: state.senderProfile.resumeFileName,
          domain: state.senderProfile.domain,
          templateKey: state.senderProfile.templateKey
        }
      : null,
    history: Array.isArray(state.history) ? state.history : []
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

function validateSenderProfile(body, file) {
  const domain = trimToString(body?.domain);
  const templateKey = trimToString(body?.templateKey);
  if (!templates[domain]?.[templateKey]) return { error: "Select a valid profile and template." };
  if (!file) return { error: "Upload a resume file." };
  return {
    value: {
      domain,
      templateKey,
      resumeFileName: file.originalname,
      resumeMimeType: file.mimetype || "application/octet-stream",
      resumeBufferBase64: file.buffer.toString("base64")
    }
  };
}

function buildMessages(state, recipientText) {
  const recipients = extractRecipients(recipientText);
  const template = templates[state.senderProfile.domain][state.senderProfile.templateKey];
  const subject = template.subject;
  const messages = recipients.map((recipient) => {
    const body = template.body({
      greeting: buildGreeting(recipient, recipients.length),
      resumeText: `Attached resume: ${state.senderProfile.resumeFileName}`
    });
    return { recipient, subject, content: body };
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

app.get("/api/bootstrap", async (_req, res, next) => {
  try {
    const state = await getAppState();
    res.json({
      ok: true,
      user: sanitizeState(state),
      templates: publicTemplates()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/user/setup/verify-smtp", async (req, res, next) => {
  try {
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
    const smtpValidation = validateSmtpPayload(req.body);
    if (smtpValidation.error) return res.status(400).json({ error: smtpValidation.error });
    const profileValidation = validateSenderProfile(req.body, req.file);
    if (profileValidation.error) return res.status(400).json({ error: profileValidation.error });

    await buildTransport(smtpValidation.value).verify();

    const updatedState = await saveAppState({
      smtpAccount: smtpValidation.value,
      senderProfile: profileValidation.value
    });
    res.json({ ok: true, user: sanitizeState(updatedState) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/user/send/preview", async (req, res, next) => {
  try {
    const state = await getAppState();
    if (!state.smtpAccount || !state.senderProfile) {
      return res.status(400).json({ error: "Complete your setup first." });
    }

    const recipientText = trimToString(req.body?.recipientText);
    const preview = buildMessages(state, recipientText);
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
    const state = await getAppState();
    if (!state.smtpAccount || !state.senderProfile) {
      return res.status(400).json({ error: "Complete your setup first." });
    }

    const recipientText = trimToString(req.body?.recipientText);
    const built = buildMessages(state, recipientText);
    if (!built.recipients.length) {
      return res.status(400).json({ error: "Paste at least one valid email address." });
    }

    const transport = buildTransport(state.smtpAccount);
    const sentMessages = [];
    for (const message of built.messages) {
      const info = await transport.sendMail({
        from: state.smtpAccount.user,
        to: message.recipient.email,
        subject: message.subject,
        text: message.content,
        attachments: [
          {
            filename: state.senderProfile.resumeFileName,
            content: Buffer.from(state.senderProfile.resumeBufferBase64, "base64"),
            contentType: state.senderProfile.resumeMimeType
          }
        ]
      });
      sentMessages.push({
        messageId: info.messageId,
        recipient: message.recipient.email,
        content: message.content
      });
    }

    const updatedState = await saveAppState({
      history: [
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          subject: built.subject,
          recipients: built.recipients.map((recipient) => recipient.email),
          sentMessages
        },
        ...(state.history || [])
      ].slice(0, MAX_HISTORY_ITEMS)
    });

    res.json({ ok: true, sent: sentMessages.length, user: sanitizeState(updatedState) });
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
