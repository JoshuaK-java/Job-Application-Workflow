"use client";

import { STATUSES, type Status } from "@/lib/statuses";
import { updateStatus } from "@/app/actions";

interface StatusSelectProps {
  id: string;
  status: Status;
}

export default function StatusSelect({ id, status }: StatusSelectProps) {
  return (
    <select
      defaultValue={status}
      onChange={(e) => updateStatus(id, e.target.value as Status)}
      className="rounded border px-2 py-1 text-sm"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
