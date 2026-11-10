/** Contents of data/profile.json, used to fill application forms. */
export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

/** The columns of an `applications` row that the apply helper needs. */
export interface ApplyJob {
  id: string;
  company: string | null;
  title: string | null;
  url: string | null;
  status: string;
  tailored_resume: string | null;
}

/** Returned by every server action in src/app/apply-actions.ts. */
export interface ApplyResult {
  ok: boolean;
  message: string;
}
