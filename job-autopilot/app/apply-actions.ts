"use server";
import { revalidatePath } from "next/cache";
import {
  closeBrowser,
  currentSession,
  fillForm,
  formPage,
  loadJob,
  loadProfile,
  makeResumePdf,
  markApplied,
  openPosting,
} from "@/lib/apply";

export type ApplyResult = { ok: boolean; message: string };

const fail = (err: unknown): ApplyResult => {
  console.error(err);
  return { ok: false, message: err instanceof Error ? err.message : String(err) };
};

// Step 1: make the PDF and open the posting in a browser window on this PC.
export async function startApply(id: string): Promise<ApplyResult> {
  try {
    const job = await loadJob(id);
    const pdfPath = await makeResumePdf(job, await loadProfile());
    await openPosting(job, pdfPath);
    return { ok: true, message: `Browser opened. Resume saved to ${pdfPath}.` };
  } catch (err) {
    return fail(err);
  }
}

// Step 2: fill the standard fields once the form is showing.
export async function fillApplication(id: string): Promise<ApplyResult> {
  try {
    const session = currentSession();
    if (!session || session.jobId !== id) return { ok: false, message: "The browser isn't open for this job. Click Open application first." };
    const page = formPage(session);
    if (!page) return { ok: false, message: "The browser window has no tabs open." };
    const filled = await fillForm(page, await loadProfile(), session.pdfPath);
    return filled.length
      ? { ok: true, message: `Filled: ${filled.join(", ")}. Check every field before submitting.` }
      : { ok: false, message: `Couldn't fill anything on this form. Fill it yourself; the PDF is at ${session.pdfPath}.` };
  } catch (err) {
    return fail(err);
  }
}

// Step 3: after Joshua clicks Submit himself.
export async function finishApply(id: string, submitted: boolean): Promise<ApplyResult> {
  try {
    await closeBrowser();
    if (!submitted) return { ok: true, message: "Browser closed. Not marked as applied." };
    const changed = await markApplied(id);
    revalidatePath("/");
    revalidatePath(`/jobs/${id}`);
    return { ok: true, message: changed ? "Marked as applied." : "Browser closed. The status was already past applied, so it was left as is." };
  } catch (err) {
    return fail(err);
  }
}
