"use client";

import { useActionState, useState } from "react";

import { addJob } from "@/app/actions";

type State = Awaited<ReturnType<typeof addJob>> | null;

export default function AddJobForm() {
  // Controlled, so the link and pasted text survive an error (React resets uncontrolled form fields after submit).
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [state, action, pending] = useActionState(
    async (prev: State, form: FormData) => {
      const result = await addJob(prev, form);
      if (!result.error) {
        setUrl("");
        setDescription("");
      }
      return result;
    },
    null,
  );
  const needsPaste = !!state && "needsPaste" in state && state.needsPaste;

  return (
    <form action={action} className="mb-8 space-y-2 rounded border p-4">
      <input
        name="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a job link"
        className="w-full rounded border px-3 py-2"
      />
      <details open={needsPaste || !!description || undefined}>
        <summary className="cursor-pointer text-sm text-gray-500">
          Site won&apos;t load? Paste the description
        </summary>
        <textarea
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Copy the whole posting (title, company, location and description) and paste it here"
          className="mt-2 w-full rounded border px-3 py-2"
        />
      </details>
      <button
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Reading the posting…" : "Add job"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
