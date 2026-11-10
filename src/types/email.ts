/** One message read from iCloud Mail by lib/mail.ts. */
export interface Email {
  id: string;
  from: string;
  subject: string;
  date: string;
  text: string;
}
