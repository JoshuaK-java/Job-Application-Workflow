import { createClient } from "@supabase/supabase-js";

// Server-only: uses the secret key, which bypasses Row Level Security.
// Never import this file from a "use client" component.
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export { STATUSES, type Status } from "@/lib/statuses";
