// Shared by server and browser code, so it must not import anything server-only.
export const STATUSES = [
  "saved",
  "tailored",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type Status = (typeof STATUSES)[number];
