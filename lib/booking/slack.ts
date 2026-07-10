import { env } from "./env";

// Fire-and-forget Slack notification. Never throws — a Slack failure must not
// break the booking flow.
export async function notifySlack(text: string): Promise<void> {
  const url = env.slackWebhook();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("[slack] notify failed:", e);
  }
}
