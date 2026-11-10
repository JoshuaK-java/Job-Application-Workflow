import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type Email = { id: string; from: string; subject: string; date: string; text: string };

// Reads recent iCloud Mail over IMAP. The inbox is opened read-only.
export async function recentEmails(days: number): Promise<Email[]> {
  const client = new ImapFlow({
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    auth: { user: process.env.ICLOUD_EMAIL!, pass: process.env.ICLOUD_APP_PASSWORD! },
    logger: false,
  });
  await client.connect();
  const emails: Email[] = [];
  const lock = await client.getMailboxLock("INBOX", { readOnly: true });
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const uids = (await client.search({ since }, { uid: true })) || [];
    if (uids.length) {
      for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
        const mail = await simpleParser(msg.source!);
        emails.push({
          id: mail.messageId ?? `uid-${msg.uid}`,
          from: mail.from?.text ?? "",
          subject: mail.subject ?? "",
          date: mail.date?.toISOString() ?? "",
          text: (mail.text ?? "").slice(0, 6000),
        });
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return emails;
}
