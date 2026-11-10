import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db, STATUSES } from "@/lib/db";
import { StatusSelect } from "./status-select";
import { AddJobForm } from "./add-job-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">My job applications</h1>
      <AddJobForm />
      <Suspense fallback={null}>
        <NeedsReview />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-gray-500">Loading applications…</p>}>
        <Applications />
      </Suspense>
    </main>
  );
}

// Emails the checker couldn't match to one role (several roles at the same company).
async function NeedsReview() {
  await connection();
  const { data } = await db
    .from("status_events")
    .select("id, email_subject, summary, created_at")
    .eq("status", "needs_review")
    .order("created_at", { ascending: false });
  if (!data?.length) return null;
  return (
    <section className="mb-8 rounded border border-amber-400 p-4">
      <h2 className="mb-2 font-semibold">Needs review ({data.length})</h2>
      <p className="mb-2 text-sm text-gray-500">
        These emails don&apos;t say which role they&apos;re about. Update the right application with its status dropdown.
      </p>
      <ul className="space-y-1 text-sm">
        {data.map((e) => (
          <li key={e.id}><span className="font-medium">{e.email_subject}</span> – {e.summary}</li>
        ))}
      </ul>
    </section>
  );
}

// Loads fresh data on every request (inside Suspense, as Next 16 Cache Components requires).
async function Applications() {
  await connection();
  const { data, error } = await db
    .from("applications")
    .select("id, company, title, location, url, status, applied_at, last_update_at")
    .order("created_at", { ascending: false });
  if (error) return <p className="text-sm text-red-600">Database error: {error.message}</p>;

  const apps = data ?? [];
  const count = (s: string) => apps.filter((a) => a.status === s).length;
  const day = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "–");

  return (
    <>
      <div className="mb-8 flex flex-wrap gap-3">
        {STATUSES.map((s) => (
          <div key={s} className="rounded border px-4 py-2">
            <div className="text-xs uppercase text-gray-500">{s}</div>
            <div className="text-xl font-semibold">{count(s)}</div>
          </div>
        ))}
      </div>

      {apps.length === 0 ? (
        <p className="text-sm text-gray-500">No applications yet. Paste a job link above to add one.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b">
            <tr>
              <th className="py-2">Company</th><th>Role</th><th>Location</th>
              <th>Applied</th><th>Last update</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-2 font-medium">{a.company}</td>
                <td><Link href={`/jobs/${a.id}`} className="underline">{a.title}</Link></td>
                <td>{a.location}</td>
                <td>{day(a.applied_at)}</td>
                <td>{day(a.last_update_at)}</td>
                <td><StatusSelect key={a.status} id={a.id} status={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
