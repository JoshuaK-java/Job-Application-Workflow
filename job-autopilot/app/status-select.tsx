"use client";
import { STATUSES, type Status } from "@/lib/statuses";
import { updateStatus } from "./actions";

export function StatusSelect({ id, status }: { id: string; status: Status }) {
  return (
    <select
      defaultValue={status}
      onChange={(e) => updateStatus(id, e.target.value as Status)}
      className="rounded border px-2 py-1 text-sm"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
