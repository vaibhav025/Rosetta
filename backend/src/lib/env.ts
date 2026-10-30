/** All configuration in one place. Everything is optional in development. */
export const env = {
  githubToken: process.env.GITHUB_TOKEN || "",
  /** GitHub's API and website. Only tests point these elsewhere (a local fake GitHub). */
  githubApiUrl: (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, ""),
  githubWebUrl: (process.env.GITHUB_WEB_URL || "https://github.com").replace(/\/$/, ""),

  /**
   * The Rosetta GitHub App: a company installs it once on its repos (private
   * ones too) and every push arrives by itself. The private key is the PEM
   * GitHub gives you, pasted with literal \n for line breaks.
   */
  githubAppId: process.env.GITHUB_APP_ID || "",
  githubAppPrivateKey: (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  // The App's URL name; a pasted github.com/apps/<slug> URL works too.
  githubAppSlug: (process.env.GITHUB_APP_SLUG || "").trim().replace(/^.*\/apps\//, "").replace(/\/+$/, ""),
  githubAppWebhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET || "",
  /** The App's OAuth client, for "Link your GitHub account" (and confirming who installed it). */
  githubAppClientId: process.env.GITHUB_APP_CLIENT_ID || "",
  githubAppClientSecret: process.env.GITHUB_APP_CLIENT_SECRET || "",

  /** Upstash QStash: runs the explain queue in its own function call. Optional; without it the webhook's after() runs it. */
  qstashToken: process.env.QSTASH_TOKEN || "",
  qstashUrl: (process.env.QSTASH_URL || "https://qstash.upstash.io").replace(/\/$/, ""),
  qstashCurrentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
  qstashNextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
  /** This backend's public address, for QStash to call back. Taken from the request when unset. */
  publicApiUrl: (process.env.PUBLIC_API_URL || "").replace(/\/$/, ""),

  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",

  /** Any OpenAI-compatible endpoint: Groq by default, or OpenRouter. */
  fallbackKey: process.env.FALLBACK_API_KEY || "",
  fallbackBaseUrl: process.env.FALLBACK_BASE_URL || "https://api.groq.com/openai/v1",
  fallbackModel: process.env.FALLBACK_MODEL || "openai/gpt-oss-120b",

  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),

  sessionSecret: process.env.SESSION_SECRET || "",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  /** Email. Gmail by default: SMTP_USER is the address, SMTP_PASS a Gmail app password. */
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpFrom: process.env.SMTP_FROM || "",

  /** The frontend's address, for links inside emails. */
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),

  /** Diffs above this many changed lines are trimmed (FR-1.4). */
  maxDiffLines: Number(process.env.MAX_DIFF_LINES || 400),
};

export const isProduction = process.env.NODE_ENV === "production";
