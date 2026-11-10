import { db, STATUSES } from "../lib/db";
import { askStructured, type JSONSchema } from "../lib/claude";
import { recentEmails } from "../lib/mail";

const DAYS = Number(process.argv[2] ?? 3);
// Cheap first pass so Claude only sees emails that might be about a job.
const JOB_WORDS = /application|applying|applied|interview|candida|next steps|offer|unfortunately|position|role|recruit/i;
const UNKNOWN_ROLE = "Unknown role";

type JobStatus = "applied" | "interviewing" | "offer" | "rejected";
type Verdict = {
  application_id: string | null;
  status: JobStatus | null;
  company: string | null;
  title: string | null;
  location: string | null;
  summary: string;
};
const VERDICT_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    application_id: { type: ["string", "null"], description: "id of the matching tracked application, or null" },
    status: { type: ["string", "null"], enum: ["applied", "interviewing", "offer", "rejected", null] },
    company: { type: ["string", "null"], description: "hiring company's name" },
    title: { type: ["string", "null"], description: "exact job title named in the email" },
    location: { type: ["string", "null"] },
    summary: { type: "string", description: "one short sentence" },
  },
  required: ["application_id", "status", "company", "title", "location", "summary"],
};
type App = { id: string; company: string | null; title: string | null; status: string };

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(inc|llc|corp|corporation|ltd|co)$/, "");

// "Software Engineer Intern" vs "Software Engineering Intern, Summer 2027" → same role.
// "Software Engineer Intern" vs "Data Analyst Intern" → different roles.
const SKIP = ["the", "and", "for", "of", "at", "in", "to", "summer", "fall", "spring", "winter", "remote", "hybrid", "onsite"];
const words = (s: string) =>
  new Set(
    s.toLowerCase()
      .replace(/front[\s-]+end/g, "frontend").replace(/back[\s-]+end/g, "backend").replace(/full[\s-]+stack/g, "fullstack")
      .replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .map((w) => w.replace(/ing$/, "").replace(/er$/, "").replace(/s$/, ""))
      .filter((w) => w && !SKIP.includes(w) && !/^\d+$/.test(w))
  );
function sameRole(a: string | null, b: string | null) {
  if (!a || !b || a === UNKNOWN_ROLE || b === UNKNOWN_ROLE) return false;
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.max(A.size, B.size) >= 0.75;
}

async function main() {
  const { data } = await db.from("applications").select("id, company, title, status");
  const apps: App[] = data ?? [];
  const emails = await recentEmails(DAYS);
  // Oldest first, so "applied" is seen before "interview" and statuses build up in order.
  emails.sort((a, b) => a.date.localeCompare(b.date));
  let updated = 0, added = 0, review = 0, failed = 0;

  for (const e of emails) {
    if (!JOB_WORDS.test(`${e.subject} ${e.text}`)) continue;
    const { data: seen } = await db.from("status_events").select("id").eq("email_id", e.id).maybeSingle();
    if (seen) continue;

    const appList = apps.map((a) => `${a.id} | ${a.company} | ${a.title}`).join("\n") || "(none yet)";
    let v: Verdict;
    try {
      v = await askStructured<Verdict>(
      process.env.CLASSIFY_MODEL!,
      `You sort job-search emails for one job seeker. Given the applications already tracked and one email, record:
application_id (id from the list or null), status, company, title (exactly as the email names it, or null), location, and a one-sentence summary.
- applied = confirmation that HIS application was received
- interviewing = invitation to interview, phone screen, online assessment, or scheduling
- offer = a job offer
- rejected = not moving forward with his application
He often applies to several roles at the same company. Only set application_id when BOTH the company and the role match a tracked application (small wording differences are fine). A different role at the same company is a different application: set application_id to null. If the email does not say which role, set "title" to null and only set application_id if that company has exactly one tracked application.
Always fill in status, company, title and location when the email gives them.
Job alerts, "jobs you may like", newsletters, recruiter cold outreach, and marketing get null status.`,
      `TRACKED APPLICATIONS:\n${appList}\n\nEMAIL\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\n\n${e.text}`,
        VERDICT_SCHEMA,
        600
      );
    } catch (err) {
      // Not saved as checked, so the next run tries this email again.
      failed++;
      console.error(`Skipped "${e.subject}": ${err instanceof Error ? err.message : err}`);
      continue;
    }

    let app = apps.find((a) => a.id === v.application_id);
    // Don't trust a match to a different company.
    if (app && v.company && norm(app.company) !== norm(v.company)) app = undefined;

    let needsReview = false;
    if (!app && v.status && v.company) {
      const sameCompany = apps.filter((a) => norm(a.company) === norm(v.company));
      if (v.title) {
        app = sameCompany.find((a) => sameRole(a.title, v.title));
        // An earlier email from this company didn't name the role: fill it in now.
        if (!app) {
          const unnamed = sameCompany.filter((a) => a.title === UNKNOWN_ROLE);
          if (unnamed.length === 1) {
            app = unnamed[0];
            await db.from("applications").update({ title: v.title }).eq("id", app.id);
            app.title = v.title;
          }
        }
      } else if (sameCompany.length === 1) {
        app = sameCompany[0];
      } else if (sameCompany.length > 1) {
        // Several roles at this company and the email doesn't say which: let him decide.
        needsReview = true;
      }
    }

    // A job applied to outside the app: add it from the email.
    if (!app && !needsReview && v.status && v.company) {
      const when = e.date || new Date().toISOString();
      const { data: created, error } = await db
        .from("applications")
        .insert({
          company: v.company,
          title: v.title ?? UNKNOWN_ROLE,
          location: v.location,
          status: v.status,
          applied_at: when,
          last_update_at: when,
          notes: "Added automatically from email",
        })
        .select("id, company, title, status")
        .single();
      if (error || !created) {
        console.error(`Couldn't add ${v.company}: ${error?.message}`);
      } else {
        app = created;
        apps.push(created);
        added++;
        console.log(`Added ${created.company}: ${created.title} (${v.status})`);
      }
    }

    if (needsReview) {
      review++;
      console.log(`Needs review: ${v.company}, ${v.status}, role not named (${e.subject})`);
    }

    await db.from("status_events").insert({
      application_id: app ? app.id : null,
      status: needsReview ? "needs_review" : app && v.status ? v.status : "irrelevant",
      source: "email",
      email_id: e.id,
      email_subject: e.subject,
      summary: needsReview ? `${v.company}: ${v.status}. ${v.summary}` : v.summary,
    });
    if (!app || !v.status) continue;

    // Only move forward (e.g. a late "we received it" email won't undo an interview).
    if (STATUSES.indexOf(v.status) > STATUSES.indexOf(app.status as (typeof STATUSES)[number])) {
      await db
        .from("applications")
        .update({
          status: v.status,
          last_update_at: new Date().toISOString(),
          ...(v.status === "applied" ? { applied_at: e.date || new Date().toISOString() } : {}),
        })
        .eq("id", app.id);
      app.status = v.status;
      updated++;
      console.log(`${app.company} – ${app.title}: ${v.status} (${e.subject})`);
    }
  }
  console.log(
    `Done. Checked ${emails.length} emails: added ${added}, updated ${updated}, ${review} need review on the dashboard, ${failed} skipped (retried next run).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
