import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { db } from "@/lib/db";
import { tailorResume, saveResume, updateStatus } from "@/app/actions";
import ApplyPanel from "@/components/ApplyPanel";

interface JobPageProps {
  params: Promise<{ id: string }>;
}

export default function JobPage({ params }: JobPageProps) {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-8">
      <Link href="/" className="text-sm underline">
        ← All applications
      </Link>
      <Suspense
        fallback={<p className="text-sm text-gray-500">Loading job…</p>}
      >
        <JobDetails params={params} />
      </Suspense>
    </main>
  );
}

async function JobDetails({ params }: JobPageProps) {
  await connection();
  const { id } = await params;
  const { data: job } = await db
    .from("applications")
    .select("*")
    .eq("id", id)
    .single();
  if (!job) return <p>Job not found.</p>;
  const { data: events } = await db
    .from("status_events")
    .select("*")
    .eq("application_id", id)
    .order("created_at", { ascending: false });

  return (
    <>
      <h1 className="text-2xl font-semibold">
        {job.title} · {job.company}
      </h1>
      <p className="text-sm text-gray-500">
        {job.location}
        {job.url && (
          <>
            {" "}
            ·{" "}
            <a href={job.url} target="_blank" className="underline">
              Posting
            </a>
          </>
        )}{" "}
        · Status: {job.status}
      </p>

      <div className="flex gap-3">
        {job.description ? (
          <form action={tailorResume.bind(null, id)}>
            <button className="rounded bg-black px-4 py-2 text-white">
              {job.tailored_resume ? "Re-tailor resume" : "Tailor resume"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500">
            Added from email, so there&apos;s no job description to tailor to.
          </p>
        )}
        <form action={updateStatus.bind(null, id, "applied")}>
          <button className="rounded border px-4 py-2">Mark as applied</button>
        </form>
      </div>

      {job.url && job.tailored_resume && <ApplyPanel id={id} />}

      {job.tailored_resume && (
        <form action={saveResume.bind(null, id)} className="space-y-2">
          <h2 className="font-semibold">Tailored resume (edit freely)</h2>
          <textarea
            name="resume"
            defaultValue={job.tailored_resume}
            rows={30}
            className="w-full rounded border p-3 font-mono text-sm"
          />
          <button className="rounded border px-4 py-2">Save edits</button>
        </form>
      )}

      <section>
        <h2 className="font-semibold">History</h2>
        <ul className="text-sm">
          {(events ?? []).map((e) => (
            <li key={e.id}>
              {new Date(e.created_at).toLocaleDateString()}: {e.status} (
              {e.source}){e.summary ? ` – ${e.summary}` : ""}
            </li>
          ))}
        </ul>
      </section>

      {job.description && (
        <details>
          <summary className="cursor-pointer font-semibold">
            Job description
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{job.description}</p>
        </details>
      )}
    </>
  );
}
