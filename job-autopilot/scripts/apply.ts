// Terminal version of the Apply panel on the job page (same code, in lib/apply.ts).
// It NEVER clicks Submit: Joshua reviews everything and submits himself.
//
// Run: npx tsx --env-file=.env.local scripts/apply.ts <job id>
import readline from "node:readline/promises";
import {
  closeBrowser, currentSession, fillForm, formPage, loadJob, loadProfile, makeResumePdf, markApplied, openPosting,
} from "../lib/apply";

async function ask(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("Usage: npx tsx --env-file=.env.local scripts/apply.ts <job id>");
  const job = await loadJob(id);
  const me = await loadProfile();
  console.log(`\n${job.title} at ${job.company}`);

  const pdfPath = await makeResumePdf(job, me);
  console.log(`Resume saved to ${pdfPath}`);

  try {
    await openPosting(job, pdfPath);
    await ask("\nClick Apply and sign in if needed. When the form is showing, press Enter here... ");
    const session = currentSession();
    const page = session && formPage(session);
    if (!page) throw new Error("The browser window was closed.");
    const filled = await fillForm(page, me, pdfPath);
    console.log(filled.length ? `Filled: ${filled.join(", ")}.` : "Couldn't fill anything on this form; fill it yourself.");

    const done = await ask("\nCheck every field, answer the rest, and click Submit yourself. Did you submit? (y/n) ");
    if (done.toLowerCase().startsWith("y")) {
      console.log((await markApplied(id)) ? "Marked as applied." : "Status was already past applied, so it was left as is.");
    } else {
      console.log("Not marked as applied.");
    }
  } finally {
    await closeBrowser();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
