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
        "I hope you are doing well.",
        "",
        "I am reaching out to express my interest in relevant opportunities with your team.",
        "",
        intro,
        "",
        "Based on the role, I believe I can contribute in the following areas:",
        ...highlights.map((item) => `- ${item}`),
        "",
        closing,
        "",
        `Resume attached for review.\n${resumeText}`,
        "",
        "Thank you for your time and consideration.",
        "",
        "Best regards,"
      ])
  };
}

const templates = {
  marketing: {
    fresher_campaign: {
      label: "Default outreach",
      subject: "Application for Marketing Opportunities",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nI hope you are doing well.\n\nI am reaching out to express my interest in marketing opportunities with your team. I am particularly interested in roles where I can support campaign execution, communication, content coordination, and audience-focused work.\n\nBased on the role, I believe I can contribute in the following areas:\n- Strong interest in content, brand communication, and audience research\n- Comfortable with coordination, writing, and structured execution\n- Ready to contribute with consistency, ownership, and a strong learning mindset\n\nIf there is a relevant opening, I would appreciate the opportunity to be considered.\n\nResume attached for review.\n${resumeText}\n\nThank you for your time and consideration.\n\nBest regards,`
    },
    fresher_growth: {
      label: "Growth-focused",
      subject: "Fresher Marketing Application for Growth-Focused Roles",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nI hope you are doing well.\n\nI am writing to express my interest in entry-level marketing roles with a growth and performance focus. I am especially interested in opportunities involving experimentation, digital channels, and measurable business outcomes.\n\nBased on the role, I believe I can contribute in the following areas:\n- Interest in social media, campaign analysis, and lead generation\n- Analytical mindset with willingness to test, learn, and improve quickly\n- Strong ownership and follow-through on execution tasks\n\nIf there is a suitable opportunity, I would be glad to be considered.\n\nResume attached for review.\n${resumeText}\n\nThank you for your time and consideration.\n\nBest regards,`
    },
    fresher_brand: {
      label: "Brand and content",
      subject: "Entry-Level Marketing Application",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nI hope you are doing well.\n\nI am writing to express my interest in entry-level marketing roles focused on brand building, content planning, and customer communication.\n\nBased on the role, I believe I can contribute in the following areas:\n- Strong written communication and creative problem-solving skills\n- Interest in campaign planning, storytelling, and cross-team collaboration\n- Adaptable, proactive, and committed to continuous learning\n\nIf there is a relevant opening, I would appreciate the opportunity to be considered.\n\nResume attached for review.\n${resumeText}\n\nThank you for your time and consideration.\n\nBest regards,`
    }
  },
  hr: {
    fresher_people_ops: {
      label: "Default outreach",
      subject: "Application for HR Opportunities",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nI hope you are doing well.\n\nI am writing to express my interest in HR opportunities with your team. I am especially interested in roles involving people operations, employee support, coordination, and well-run HR processes.\n\nBased on the role, I believe I can contribute in the following areas:\n- Strong communication, coordination, and organizational skills\n- Interest in onboarding, employee engagement, and HR processes\n- Reliable, empathetic, and eager to learn in a structured team environment\n\nIf there is a suitable opening, I would appreciate the opportunity to be considered.\n\nResume attached for review.\n${resumeText}\n\nThank you for your time and consideration.\n\nBest regards,`
    },
    fresher_talent: {
      label: "Talent acquisition",
      subject: "Fresher Application for Talent Acquisition / HR Roles",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nI hope you are doing well.\n\nI am writing to express my interest in HR roles, especially in recruitment and talent coordination. I am particularly interested in supporting candidate communication and hiring operations.\n\nBased on the role, I believe I can contribute in the following areas:\n- Interest in recruitment workflow, screening coordination, and candidate communication\n- Strong interpersonal skills with an organized and process-oriented approach\n- Quick learner ready to support hiring teams effectively\n\nIf there is a relevant opportunity, I would appreciate the chance to be considered.\n\nResume attached for review.\n${resumeText}\n\nThank you for your time and consideration.\n\nBest regards,`
    },
    fresher_generalist: {
      label: "HR generalist",
      subject: "Entry-Level HR Application",
      body: ({ greeting, resumeText }) =>
        `${greeting}\n\nI hope you are doing well.\n\nI am writing to express my interest in entry-level HR opportunities with a focus on employee support, coordination, and strong internal processes.\n\nBased on the role, I believe I can contribute in the following areas:\n- Good communication, documentation, and stakeholder coordination skills\n- Interest in policy support, onboarding, and employee engagement activities\n- Dependable and eager to grow within an HR generalist role\n\nIf there is a suitable opening, I would be glad to be considered.\n\nResume attached for review.\n${resumeText}\n\nThank you for your time and consideration.\n\nBest regards,`
    }
  },
  engineering: {
    engineering_general: buildRoleTemplate({
      label: "Default outreach",
      subject: "Application for Engineering Opportunities",
      intro: "I am reaching out to express my interest in software engineering opportunities where I can contribute through solid implementation, reliable execution, and effective collaboration.",
      highlights: [
        "Comfortable working across application logic, debugging, APIs, and production-focused development",
        "Strong focus on writing maintainable code, learning quickly, and delivering dependable results",
        "Able to contribute independently while collaborating well with product, design, and engineering teams"
      ],
      closing: "If there is a suitable opening on your team, I would appreciate the opportunity to be considered."
    }),
    ai_ml_engineer: buildRoleTemplate({
      label: "AI / ML engineer",
      subject: "Application for AI / ML Opportunities",
      intro: "I am reaching out to express my interest in AI and machine learning opportunities where I can contribute to practical ML systems, model-backed features, and measurable product improvements.",
      highlights: [
        "Experience with ML workflows, model evaluation, and production-oriented problem solving",
        "Comfortable with Python, data pipelines, experimentation, and integrating models into applications",
        "Interested in applied AI work across LLM features, recommendation systems, forecasting, or predictive modeling"
      ],
      closing: "If there is a relevant opening on your team, I would value the opportunity to be considered."
    }),
    full_stack_developer: buildRoleTemplate({
      label: "Full stack developer",
      subject: "Application for Full Stack Developer Role",
      intro: "I am reaching out to express my interest in full stack development opportunities spanning backend services, frontend experiences, APIs, and deployment workflows.",
      highlights: [
        "Hands-on experience across UI development, server-side implementation, and database-backed applications",
        "Strong focus on shipping reliable features, debugging efficiently, and maintaining clean code",
        "Comfortable collaborating across product, design, and engineering to deliver production-ready systems"
      ],
      closing: "If there is a suitable opening, I would be glad to discuss how I could contribute."
    }),
    frontend_developer: buildRoleTemplate({
      label: "Frontend developer",
      subject: "Application for Frontend Developer Role",
      intro: "I am writing to express my interest in frontend development opportunities focused on responsive, accessible, and high-quality interfaces with strong attention to performance and usability.",
      highlights: [
        "Experience turning product requirements into polished web experiences",
        "Comfortable with modern JavaScript frameworks, state management, and API integration",
        "Strong interest in UI quality, performance tuning, and maintainable component systems"
      ],
      closing: "If there is a relevant role on your side, I would appreciate the chance to be considered."
    }),
    backend_developer: buildRoleTemplate({
      label: "Backend developer",
      subject: "Application for Backend Developer Role",
      intro: "I am writing to express my interest in backend development opportunities focused on API design, reliable services, and systems that scale cleanly under product demands.",
      highlights: [
        "Experience with backend application logic, databases, integrations, and service reliability",
        "Comfortable with performance tuning, debugging, and maintainable service design",
        "Strong interest in clean architecture, data correctness, and production operations"
      ],
      closing: "If there is a suitable backend opportunity, I would be glad to be considered."
    }),
    data_engineer: buildRoleTemplate({
      label: "Data engineer",
      subject: "Application for Data Engineer Role",
      intro: "I am reaching out to express my interest in data engineering opportunities focused on dependable pipelines, clean data models, and systems that help teams trust and use data effectively.",
      highlights: [
        "Experience with ETL or ELT workflows, data transformation, and pipeline reliability",
        "Comfortable working with SQL, Python, warehousing concepts, and automation",
        "Interested in building scalable data foundations for analytics and machine learning use cases"
      ],
      closing: "If there is a relevant opening, I would appreciate the opportunity to be considered."
    }),
    devops_engineer: buildRoleTemplate({
      label: "DevOps / platform engineer",
      subject: "Application for DevOps / Platform Engineer Role",
      intro: "I am reaching out to express my interest in DevOps and platform engineering opportunities focused on delivery workflows, infrastructure reliability, and developer productivity.",
      highlights: [
        "Experience with CI/CD, deployment automation, observability, and infrastructure workflows",
        "Comfortable with cloud services, containers, scripting, and operational debugging",
        "Strong focus on reliability, automation, and reducing friction in engineering systems"
      ],
      closing: "If there is a suitable opening, I would be glad to discuss how I could contribute."
    }),
    qa_engineer: buildRoleTemplate({
      label: "QA / SDET",
      subject: "Application for QA Engineer / SDET Role",
      intro: "I am writing to express my interest in QA and SDET opportunities focused on product quality through structured testing, automation, and defect analysis.",
      highlights: [
        "Experience with test planning, bug investigation, and automation-driven quality workflows",
        "Comfortable validating APIs, UI behavior, regression coverage, and release readiness",
        "Strong attention to detail with a practical mindset around product risk reduction"
      ],
      closing: "If there is a relevant opening, I would appreciate the opportunity to be considered."
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
  return total > 1 ? "Hello," : "Hello,";
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
          resumeFileName: state.senderProfile.resumeFileName
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
  if (!file) return { error: "Upload a resume file." };
  return {
    value: {
      resumeFileName: file.originalname,
      resumeMimeType: file.mimetype || "application/octet-stream",
      resumeBufferBase64: file.buffer.toString("base64")
    }
  };
}

function resolveTemplateSelection(state, selection) {
  const firstDomain = Object.keys(templates)[0] || "";
  const fallbackDomain = trimToString(selection?.domain) || firstDomain;
  const fallbackTemplateKey = trimToString(selection?.templateKey) || Object.keys(templates[fallbackDomain] || {})[0] || "";
  const selectedDomain = fallbackDomain;
  const selectedTemplateKey = fallbackTemplateKey;
  if (!templates[selectedDomain]?.[selectedTemplateKey]) {
    throw new Error("Select a valid profile and template.");
  }
  return {
    domain: selectedDomain,
    templateKey: selectedTemplateKey,
    template: templates[selectedDomain][selectedTemplateKey]
  };
}

function resolveResumeSelection(state, file) {
  if (file) {
    return {
      resumeFileName: file.originalname,
      resumeMimeType: file.mimetype || "application/octet-stream",
      resumeBufferBase64: file.buffer.toString("base64")
    };
  }
  if (state.senderProfile?.resumeFileName && state.senderProfile?.resumeBufferBase64) {
    return state.senderProfile;
  }
  throw new Error("Upload a resume file.");
}

function buildMessages(state, recipientText, selection, file) {
  const recipients = extractRecipients(recipientText);
  const { template } = resolveTemplateSelection(state, selection);
  const resume = resolveResumeSelection(state, file);
  const subject = template.subject;
  const messages = recipients.map((recipient) => {
    const body = template.body({
      greeting: buildGreeting(recipient, recipients.length),
      resumeText: `Attached resume: ${resume.resumeFileName}`
    });
    return { recipient, subject, content: body };
  });
  return { recipients, subject, messages, resume };
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
    await buildTransport(smtpValidation.value).verify();

    const updatedState = await saveAppState({
      smtpAccount: smtpValidation.value,
      senderProfile: req.file
        ? validateSenderProfile(req.body, req.file).value
        : (await getAppState()).senderProfile
    });
    res.json({ ok: true, user: sanitizeState(updatedState) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/user/send/preview", upload.single("resumeFile"), async (req, res, next) => {
  try {
    const state = await getAppState();
    if (!state.smtpAccount) {
      return res.status(400).json({ error: "Complete your setup first." });
    }

    const recipientText = trimToString(req.body?.recipientText);
    const preview = buildMessages(state, recipientText, req.body, req.file);
    if (!preview.recipients.length) {
      return res.status(400).json({ error: "Paste at least one valid email address." });
    }
    res.json({ ok: true, ...preview });
  } catch (error) {
    next(error);
  }
});

app.post("/api/user/send", upload.single("resumeFile"), async (req, res, next) => {
  try {
    const state = await getAppState();
    if (!state.smtpAccount) {
      return res.status(400).json({ error: "Complete your setup first." });
    }

    const recipientText = trimToString(req.body?.recipientText);
    const built = buildMessages(state, recipientText, req.body, req.file);
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
            filename: built.resume.resumeFileName,
            content: Buffer.from(built.resume.resumeBufferBase64, "base64"),
            contentType: built.resume.resumeMimeType
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
