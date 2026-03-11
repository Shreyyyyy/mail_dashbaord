const crypto = require("crypto");
const path = require("path");
const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const SESSION_COOKIE = "resume_mailer_sid";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const sessionStore = new Map();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const templates = {
  marketing: {
    fresher_campaign: {
      subject: "Application for Marketing Associate",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher eager to begin my career in marketing. I enjoy shaping clear messaging, supporting campaign execution, and learning quickly in fast-moving teams.\n\nHighlights:\n- Strong interest in content, brand communication, and audience research\n- Comfortable with coordination, writing, and structured execution\n- Ready to contribute with energy and consistency from day one\n\nResume:\n${resumeText}\n\nThank you for your time. I would value the opportunity to speak about any suitable marketing openings.\n\nBest regards,\n${name}`
    },
    fresher_growth: {
      subject: "Fresher Marketing Application for Growth-Focused Roles",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher interested in marketing roles with a strong growth and performance focus. I am motivated by experimentation, digital channels, and measurable business impact.\n\nHighlights:\n- Interest in social media, campaign analysis, and lead generation\n- Analytical mindset with willingness to test, learn, and improve quickly\n- Strong ownership and follow-through on execution tasks\n\nResume:\n${resumeText}\n\nI would appreciate the chance to discuss how I can support your marketing team in an entry-level role.\n\nBest regards,\n${name}`
    },
    fresher_brand: {
      subject: "Entry-Level Marketing Application",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher seeking an opportunity to start my marketing career. I am especially interested in brand building, content planning, and customer-focused communication.\n\nHighlights:\n- Strong written communication and creative problem-solving skills\n- Interest in campaign planning, storytelling, and cross-team collaboration\n- Adaptable, proactive, and committed to continuous learning\n\nResume:\n${resumeText}\n\nPlease consider my profile for relevant fresher marketing roles. I would be glad to connect.\n\nBest regards,\n${name}`
    }
  },
  hr: {
    fresher_people_ops: {
      subject: "Application for HR Associate Role",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher looking to begin my career in HR. I am interested in people operations, employee support, and building strong workplace experiences.\n\nHighlights:\n- Strong communication, coordination, and organizational skills\n- Interest in onboarding, employee engagement, and HR processes\n- Reliable, empathetic, and eager to learn from structured HR teams\n\nResume:\n${resumeText}\n\nThank you for your time. I would welcome the opportunity to discuss any entry-level HR openings.\n\nBest regards,\n${name}`
    },
    fresher_talent: {
      subject: "Fresher Application for Talent Acquisition / HR Roles",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher interested in HR roles, especially in recruitment and talent coordination. I am keen to contribute to candidate experience and hiring operations.\n\nHighlights:\n- Interest in recruitment workflow, screening coordination, and candidate communication\n- Strong interpersonal skills with an organized and process-oriented approach\n- Quick learner ready to support hiring teams effectively\n\nResume:\n${resumeText}\n\nI would appreciate the opportunity to be considered for fresher HR or talent acquisition openings.\n\nBest regards,\n${name}`
    },
    fresher_generalist: {
      subject: "Entry-Level HR Application",
      body: ({ greeting, name, resumeText }) =>
        `${greeting}\n\nI am ${name}, a fresher seeking to start my career in human resources. I am motivated by the chance to support employees, improve coordination, and contribute to strong internal processes.\n\nHighlights:\n- Good communication, documentation, and stakeholder coordination skills\n- Interest in policy support, onboarding, and employee engagement activities\n- Dependable and eager to grow within an HR generalist role\n\nResume:\n${resumeText}\n\nPlease consider my profile for suitable entry-level HR opportunities. I would be glad to connect.\n\nBest regards,\n${name}`
    }
  }
};

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((cookies, part) => {
    const [key, ...value] = part.trim().split("=");
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(value.join("="));
    return cookies;
  }, {});
}

function getSession(req, res) {
  const cookies = parseCookies(req);
  let sid = cookies[SESSION_COOKIE];
  if (!sid || !sessionStore.has(sid)) {
    sid = crypto.randomUUID();
    sessionStore.set(sid, {
      smtp: null,
      resume: null,
      history: []
    });
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax`);
  }
  return sessionStore.get(sid);
}

function buildTransport(smtp) {
  const port = Number(smtp.port);
  const secure = Boolean(smtp.secure) || port === 465;

  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    },
    tls: smtp.tlsRejectUnauthorized === false ? { rejectUnauthorized: false } : undefined
  });
}

function extractRecipients(raw) {
  if (!raw) return [];
  const matches = String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const seen = new Set();
  const recipients = [];

  for (const email of matches) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push({
      email: normalized,
      name: inferRecipientName(normalized)
    });
  }

  return recipients;
}

function inferRecipientName(email) {
  const localPart = email.split("@")[0] || "";
  if (!localPart) return null;

  const tokens = localPart
    .split(/[._-]+/)
    .map((token) => token.replace(/\d+/g, "").trim())
    .filter(Boolean)
    .filter((token) => !["hr", "jobs", "careers", "career", "recruitment", "recruiter", "talent", "team", "hiring", "info", "admin", "contact"].includes(token.toLowerCase()));

  if (tokens.length === 0) return null;
  return tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()).join(" ");
}

function buildGreeting(recipient, recipientCount) {
  if (recipient?.name) {
    return `Hello ${recipient.name},`;
  }
  if (recipientCount > 1) {
    return "Hello Hiring Team,";
  }
  return "Hello Hiring Manager,";
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

function buildTemplateOptions() {
  return Object.fromEntries(
    Object.entries(templates).map(([domain, variants]) => [
      domain,
      Object.entries(variants).map(([key, template]) => ({
        key,
        subject: template.subject
      }))
    ])
  );
}

function sanitizeResume(resume) {
  if (!resume) return null;
  return {
    fromName: resume.fromName,
    fromEmail: resume.fromEmail,
    hrEmails: resume.hrEmails,
    resumeFileName: resume.resumeFileName,
    resumeMimeType: resume.resumeMimeType,
    resumeSize: resume.resumeSize
  };
}

app.get("/api/session", (req, res) => {
  const session = getSession(req, res);
  return res.json({
    smtp: sanitizeSmtp(session.smtp),
    resume: sanitizeResume(session.resume),
    history: session.history,
    templates: buildTemplateOptions()
  });
});

app.post("/api/verify", async (req, res) => {
  try {
    const session = getSession(req, res);
    const { smtp } = req.body || {};
    if (!smtp?.host || !smtp?.port || !smtp?.user || !smtp?.pass) {
      return res.status(400).json({ error: "Missing SMTP credentials." });
    }

    const transport = buildTransport(smtp);
    await transport.verify();
    session.smtp = {
      host: smtp.host,
      port: smtp.port,
      secure: Boolean(smtp.secure),
      user: smtp.user,
      pass: smtp.pass,
      tlsRejectUnauthorized: smtp.tlsRejectUnauthorized !== false
    };

    return res.json({ ok: true, smtp: sanitizeSmtp(session.smtp) });
  } catch (err) {
    return res.status(400).json({ error: err.message || "SMTP verification failed." });
  }
});

app.post("/api/resume", upload.single("resumeFile"), (req, res) => {
  const session = getSession(req, res);
  const { fromName, fromEmail, hrEmails } = req.body || {};
  const resumeFile = req.file;

  if (!fromName || !fromEmail || !hrEmails || !resumeFile) {
    return res.status(400).json({ error: "Missing required resume details." });
  }

  session.resume = {
    fromName: String(fromName).trim(),
    fromEmail: String(fromEmail).trim(),
    hrEmails: String(hrEmails).trim(),
    resumeFileName: resumeFile.originalname,
    resumeMimeType: resumeFile.mimetype || "application/octet-stream",
    resumeSize: resumeFile.size,
    resumeBuffer: resumeFile.buffer
  };

  return res.json({ ok: true, resume: sanitizeResume(session.resume) });
});

app.post("/api/send", async (req, res) => {
  try {
    const session = getSession(req, res);
    const {
      domain,
      templateKey,
      customSubject,
      customNote
    } = req.body || {};

    if (!session.smtp) {
      return res.status(400).json({ error: "Verify SMTP first." });
    }
    if (!session.resume) {
      return res.status(400).json({ error: "Save resume details first." });
    }

    const recipients = extractRecipients(session.resume.hrEmails);
    if (recipients.length === 0) {
      return res.status(400).json({ error: "Please provide at least one HR email." });
    }

    const template = templates?.[domain]?.[templateKey];
    if (!template) {
      return res.status(400).json({ error: "Invalid template selection." });
    }

    const subject = String(customSubject || "").trim() || template.subject;
    const transport = buildTransport(session.smtp);
    const sentMessages = [];

    for (const recipient of recipients) {
      const baseBody = template.body({
        greeting: buildGreeting(recipient, recipients.length),
        name: session.resume.fromName,
        resumeText: `Attached resume: ${session.resume.resumeFileName}`
      });
      const finalBody = customNote ? `${baseBody}\n\nAdditional Note:\n${String(customNote).trim()}` : baseBody;

      const info = await transport.sendMail({
        from: `${session.resume.fromName} <${session.resume.fromEmail}>`,
        to: recipient.email,
        subject,
        text: finalBody,
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
        recipient: recipient.email,
        content: finalBody
      });
    }

    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      domain,
      templateKey,
      recipients: recipients.map((recipient) => recipient.email),
      subject,
      content: sentMessages[0]?.content || "",
      recipientDetails: recipients,
      fromName: session.resume.fromName,
      fromEmail: session.resume.fromEmail,
      accepted: sentMessages.flatMap((item) => item.accepted || []),
      sentMessages
    };

    session.history.unshift(entry);

    return res.json({
      ok: true,
      messageId: sentMessages[0]?.messageId,
      accepted: entry.accepted,
      entry
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to send email." });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
