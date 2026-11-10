"use server";

import { revalidatePath } from "next/cache";
import { readFile } from "node:fs/promises";
import * as cheerio from "cheerio";

import { db, type Status } from "@/lib/db";
import { askStructured, askText, type JSONSchema } from "@/lib/claude";

export async function updateStatus(id: string, status: Status) {
  const now = new Date().toISOString();
  await db
    .from("applications")
    .update({
      status,
      last_update_at: now,
      ...(status === "applied" ? { applied_at: now } : {}),
    })
    .eq("id", id);
  await db
    .from("status_events")
    .insert({ application_id: id, status, source: "manual" });
  revalidatePath("/");
  revalidatePath(`/jobs/${id}`);
}

interface Job {
  company: string;
  title: string;
  location: string;
  description: string;
}

const JOB_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    company: { type: "string" },
    title: { type: "string" },
    location: { type: "string" },
    description: {
      type: "string",
      description:
        "Full posting text (responsibilities, requirements, qualifications), copied faithfully. Empty if there is no job posting.",
    },
  },
  required: ["company", "title", "location", "description"],
};

// Indeed search-result links (…/jobs?q=…&vjk=ID) point at a list, not the job. Use the job's own page.
function cleanJobUrl(raw: string) {
  try {
    const u = new URL(raw);
    const jk = u.searchParams.get("jk") ?? u.searchParams.get("vjk");
    if (/(^|\.)indeed\.com$/i.test(u.hostname) && jk)
      return `https://${u.hostname}/viewjob?jk=${jk}`;
  } catch {
    // Not a valid URL; leave it as typed.
  }
  return raw;
}

// Sites that block automatic reading. The job is still added with its link once the description is pasted.
const BLOCKED_HOSTS: Record<string, string> = {
  "indeed.com": "Indeed",
  "linkedin.com": "LinkedIn",
  "glassdoor.com": "Glassdoor",
  "ziprecruiter.com": "ZipRecruiter",
};
function blockedSite(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      Object.entries(BLOCKED_HOSTS).find(
        ([h]) => host === h || host.endsWith(`.${h}`),
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}

export async function addJob(_prev: unknown, form: FormData) {
  const url = cleanJobUrl(String(form.get("url") ?? "").trim());
  let pageText = String(form.get("description") ?? "").trim();
  if (!url) return { error: "Add the job link." };

  if (!pageText) {
    const site = blockedSite(url);
    if (site) {
      return {
        error: `${site} blocks apps from reading its job pages. Open the posting, copy the whole description, and paste it in the box below. (If it says "Apply on company site", that company link usually works here directly.)`,
        needsPaste: true,
      };
    }
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) {
        return {
          error: `That site refused the request (error ${res.status}). Paste the description in the box below.`,
          needsPaste: true,
        };
      }
      const $ = cheerio.load(await res.text());
      $("script, style, nav, footer, header").remove();
      pageText = $("body").text().replace(/\s+/g, " ").slice(0, 30000);
    } catch {
      return {
        error:
          "Couldn't open that page. Paste the description in the box below.",
        needsPaste: true,
      };
    }
  }

  let job: Job;
  try {
    job = await askStructured<Job>(
      process.env.CLASSIFY_MODEL!,
      `Extract the job posting from this web page text: company, title, location, and the full description copied faithfully, not summarized.
If the page has no job posting, record an empty description.`,
      pageText,
      JOB_SCHEMA,
      8000,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("addJob: Claude call failed:", message);
    return {
      error: `Couldn't read the posting (${message}). Paste the description in the box below.`,
    };
  }

  if (!job.description || job.description.length < 200) {
    return {
      error:
        "Couldn't find the job description on that page. Paste it in the box below.",
      needsPaste: true,
    };
  }

  const { error } = await db.from("applications").insert({ url, ...job });
  if (error)
    return {
      error: error.message.includes("duplicate")
        ? "You've already added this job."
        : error.message,
    };

  revalidatePath("/");
  return { error: null };
}

const TAILOR_RULES = `You tailor resumes to job postings.
Rules:
- Use ONLY facts in the master resume. Never add skills, tools, employers, titles, dates, degrees or numbers that aren't there.
- You may cut, reorder, and reword bullets so the most relevant experience comes first and uses the posting's vocabulary, when it is truthful.
- Keep it to one page. Cut the least relevant bullets first.
- Keep contact details, employers, titles and dates exactly as written.
- Output the finished resume in Markdown only, with no commentary.`;

export async function tailorResume(id: string) {
  const { data: job } = await db
    .from("applications")
    .select("*")
    .eq("id", id)
    .single();
  if (!job) return;
  const master = await readFile("data/master-resume.md", "utf8");

  const tailored = await askText(
    process.env.TAILOR_MODEL!,
    TAILOR_RULES,
    `MASTER RESUME:\n${master}\n\nJOB POSTING (${job.title} at ${job.company}):\n${job.description}`,
  );

  await db
    .from("applications")
    .update({
      tailored_resume: tailored,
      // Don't move an application backwards if it's already past "tailored".
      ...(job.status === "saved" ? { status: "tailored" } : {}),
      last_update_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/");
  revalidatePath(`/jobs/${id}`);
}

export async function saveResume(id: string, form: FormData) {
  await db
    .from("applications")
    .update({ tailored_resume: String(form.get("resume")) })
    .eq("id", id);
  revalidatePath(`/jobs/${id}`);
}
