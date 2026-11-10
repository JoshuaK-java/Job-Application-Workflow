// Assisted applying, shared by the dashboard (src/app/apply-actions.ts) and scripts/apply.ts.
// Server-only: launches a real browser on this PC and writes to the database.
// It NEVER clicks Submit: Joshua reviews everything and submits himself.
import {
  chromium,
  type BrowserContext,
  type Frame,
  type Locator,
  type Page,
} from "playwright";
import { marked } from "marked";
import { mkdir, readFile } from "node:fs/promises";

import { db } from "@/lib/db";
import type { ApplyJob, Profile } from "@/types/apply";

const PROFILE_DIR = "data/browser-profile";
const RESUME_DIR = "data/resumes";
// Only these statuses move forward to "applied"; anything later is left alone.
const BEFORE_APPLIED = ["saved", "tailored"];

const PDF_CSS = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.3; color: #111; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 2pt; }
  h2 { font-size: 11.5pt; text-transform: uppercase; letter-spacing: 0.5pt; border-bottom: 1px solid #444; margin: 10pt 0 4pt; padding-bottom: 1pt; }
  h3 { font-size: 10.5pt; margin: 6pt 0 2pt; }
  p { margin: 2pt 0; }
  ul { margin: 2pt 0 4pt; padding-left: 14pt; }
  li { margin: 1pt 0; }
  a { color: #111; text-decoration: none; }
`;

export async function loadProfile(): Promise<Profile> {
  return JSON.parse(await readFile("data/profile.json", "utf8"));
}

export async function loadJob(id: string): Promise<ApplyJob> {
  const { data: job, error } = await db
    .from("applications")
    .select("id, company, title, url, status, tailored_resume")
    .eq("id", id)
    .single();
  if (error || !job) throw new Error(`No job with id ${id}.`);
  if (!job.url)
    throw new Error(
      "This job has no link (it was probably added from an email), so there's no form to open.",
    );
  if (!job.tailored_resume)
    throw new Error("Tailor the resume for this job first.");
  return job;
}

export async function makeResumePdf(job: ApplyJob, me: Profile) {
  await mkdir(RESUME_DIR, { recursive: true });
  const safe = (s: string) =>
    s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  const pdfPath = `${RESUME_DIR}/${safe(`${me.firstName} ${me.lastName} ${job.company ?? ""} ${job.title ?? ""}`)}.pdf`;
  const printer = await chromium.launch();
  try {
    const p = await printer.newPage();
    await p.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${PDF_CSS}</style></head>` +
        `<body>${await marked(job.tailored_resume ?? "")}</body></html>`,
    );
    await p.pdf({
      path: pdfPath,
      format: "Letter",
      margin: { top: "0.5in", bottom: "0.5in", left: "0.6in", right: "0.6in" },
    });
  } finally {
    await printer.close();
  }
  return pdfPath;
}

// One visible browser at a time: the persistent profile can only be opened once.
// Kept on globalThis so it survives Next.js dev reloads.
interface Session {
  context: BrowserContext;
  jobId: string;
  pdfPath: string;
}
const g = globalThis as unknown as { applySession?: Session };

export function currentSession() {
  return g.applySession ?? null;
}

async function openContext() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
  });
  context.on("close", () => {
    if (g.applySession?.context === context) g.applySession = undefined;
  });
  return context;
}

// Opens the posting in a real browser window (sign-ins are remembered between runs).
export async function openPosting(job: ApplyJob, pdfPath: string) {
  let session = g.applySession;
  if (!session) {
    session = { context: await openContext(), jobId: job.id, pdfPath };
    g.applySession = session;
  } else {
    session.jobId = job.id;
    session.pdfPath = pdfPath;
  }
  const page = await session.context.newPage();
  // Close leftover tabs (e.g. a blank start tab or a previous job).
  for (const other of session.context.pages())
    if (other !== page) await other.close().catch(() => {});
  await page.goto(job.url!);
  await page.bringToFront();
  return page;
}

export async function closeBrowser() {
  const session = g.applySession;
  g.applySession = undefined;
  await session?.context.close().catch(() => {});
}

// Fill the first visible, empty, editable field whose label matches, in any frame.
async function fill(frames: Frame[], label: RegExp, value?: string) {
  if (!value) return false;
  for (const frame of frames) {
    const fields = frame.getByLabel(label);
    const n = await fields.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const field = fields.nth(i);
      try {
        if (!(await field.isVisible()) || !(await field.isEditable())) continue;
        if (await field.inputValue()) continue; // never overwrite what's already there
        await field.fill(value);
        return true;
      } catch {
        // Not a text input (a select or a custom widget). Try the next one.
      }
    }
  }
  return false;
}

// Prefer a file input labelled as the resume/CV; fall back to the first one.
async function findResumeInput(frames: Frame[]): Promise<Locator | null> {
  let fallback: Locator | null = null;
  for (const frame of frames) {
    const inputs = frame.locator("input[type=file]");
    const n = await inputs.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const input = inputs.nth(i);
      const hint = await input
        .evaluate((el) => {
          const e = el as HTMLInputElement;
          const label = e.labels?.[0]?.textContent ?? "";
          const around = e.closest("div, fieldset, section")?.textContent ?? "";
          return `${e.name} ${e.id} ${e.getAttribute("aria-label") ?? ""} ${label} ${around.slice(0, 200)}`;
        })
        .catch(() => "");
      if (
        /resume|résumé|\bcv\b/i.test(hint) &&
        !/cover/i.test(hint.slice(0, 80))
      )
        return input;
      fallback ??= input;
    }
  }
  return fallback;
}

// Fills the standard fields and attaches the PDF. Returns what it filled.
export async function fillForm(page: Page, me: Profile, pdfPath: string) {
  await page.bringToFront();
  const frames = page.frames(); // includes embedded forms (e.g. Greenhouse iframes)
  const filled: string[] = [];
  const tryFill = async (name: string, label: RegExp, value?: string) => {
    if (await fill(frames, label, value)) filled.push(name);
  };
  // Order matters: specific labels before general ones.
  await tryFill("first name", /first name|given name/i, me.firstName);
  await tryFill("last name", /last name|family name|surname/i, me.lastName);
  await tryFill("email", /e-?mail/i, me.email);
  await tryFill("phone", /phone|mobile/i, me.phone);
  await tryFill("location", /location|city/i, me.location);
  await tryFill("LinkedIn", /linkedin/i, me.linkedin);
  await tryFill("GitHub", /github/i, me.github);
  await tryFill(
    "website",
    /website|portfolio|personal (site|url)/i,
    me.website ?? me.github,
  );

  const upload = await findResumeInput(frames);
  if (upload) {
    try {
      await upload.setInputFiles(pdfPath);
      filled.push("resume PDF");
    } catch {
      // Leave it for Joshua to attach by hand.
    }
  }
  return filled;
}

// The tab the form is in: the most recently opened one (Apply buttons often open a new tab).
export function formPage(session: Session) {
  return session.context.pages().at(-1) ?? null;
}

// Marks the job applied unless its status has already moved past that.
// Returns false if it was left alone.
export async function markApplied(id: string) {
  const { data: job } = await db
    .from("applications")
    .select("status")
    .eq("id", id)
    .single();
  if (!job || !BEFORE_APPLIED.includes(job.status)) return false;
  const now = new Date().toISOString();
  await db
    .from("applications")
    .update({ status: "applied", applied_at: now, last_update_at: now })
    .eq("id", id);
  await db
    .from("status_events")
    .insert({ application_id: id, status: "applied", source: "manual" });
  return true;
}
