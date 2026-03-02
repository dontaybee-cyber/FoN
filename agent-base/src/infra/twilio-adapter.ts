import type { AgentDeps } from "../agents/deps.js";

export type TwilioMessage = {
  to: string;
  body: string;
  channel: "sms" | "whatsapp";
};

export type TwilioReply = {
  from: string;
  body: string;
  channel: "sms" | "whatsapp";
};

export function createTwilioAdapter(deps: AgentDeps) {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"] ?? "";
  const authToken = process.env["TWILIO_AUTH_TOKEN"] ?? "";
  const smsFrom = process.env["TWILIO_PHONE_NUMBER"] ?? "";
  const whatsappFrom = process.env["TWILIO_WHATSAPP_NUMBER"];

  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.");
  }

  if (!smsFrom) {
    throw new Error("TWILIO_PHONE_NUMBER is required.");
  }

  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  async function send(message: TwilioMessage): Promise<void> {
    const from =
      message.channel === "whatsapp"
        ? (whatsappFrom ?? `whatsapp:${smsFrom}`)
        : smsFrom;

    const to =
      message.channel === "whatsapp" && !message.to.startsWith("whatsapp:")
        ? `whatsapp:${message.to}`
        : message.to;

    const body = new URLSearchParams({
      From: from,
      To: to,
      Body: message.body,
    });

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Twilio send failed (${response.status}): ${err}`);
    }

    deps.log.info(
      `[Twilio] ${message.channel.toUpperCase()} sent to ${message.to}`,
    );
  }

  return {
    async sendSMS(to: string, body: string): Promise<void> {
      await send({ to, body, channel: "sms" });
    },

    async sendWhatsApp(to: string, body: string): Promise<void> {
      await send({ to, body, channel: "whatsapp" });
    },

    async sendOutreach(to: string, body: string): Promise<void> {
      try {
        await send({ to, body, channel: "sms" });
      } catch (err) {
        deps.log.warn(
          `[Twilio] SMS failed, trying WhatsApp — ${err instanceof Error ? err.message : String(err)}`,
        );
        await send({ to, body, channel: "whatsapp" });
      }
    },
  };
}
