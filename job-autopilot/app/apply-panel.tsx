"use client";
import { useState, useTransition } from "react";
import { startApply, fillApplication, finishApply, type ApplyResult } from "./apply-actions";

type Stage = "idle" | "open" | "filled";

export function ApplyPanel({ id }: { id: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ApplyResult>, next?: Stage) =>
    startTransition(async () => {
      const r = await action();
      setResult(r);
      if (r.ok && next) setStage(next);
    });

  const btn = "rounded px-4 py-2 disabled:opacity-50";

  return (
    <section className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Apply</h2>

      {stage === "idle" && (
        <>
          <p className="text-sm text-gray-500">
            Opens the posting in a browser window and saves your tailored resume as a PDF.
          </p>
          <button disabled={pending} onClick={() => run(() => startApply(id), "open")} className={`${btn} bg-black text-white`}>
            {pending ? "Opening…" : "Open application"}
          </button>
        </>
      )}

      {stage !== "idle" && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>In the browser window, click Apply and sign in if needed.</li>
            <li>When the form is showing, click <b>Fill form</b>. You can click it again on later pages.</li>
            <li>Check every field, answer the rest, and click Submit on the site yourself.</li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <button disabled={pending} onClick={() => run(() => fillApplication(id), "filled")} className={`${btn} bg-black text-white`}>
              {pending ? "Working…" : "Fill form"}
            </button>
            <button disabled={pending} onClick={() => run(() => finishApply(id, true), "idle")} className={`${btn} border`}>
              I submitted it: mark applied
            </button>
            <button disabled={pending} onClick={() => run(() => finishApply(id, false), "idle")} className={`${btn} border`}>
              Close browser
            </button>
          </div>
        </>
      )}

      {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-700"}`}>{result.message}</p>}
    </section>
  );
}
