import { describe, it, expect, vi, afterEach } from "vitest";
import { createTwilioAdapter } from "./twilio-adapter.js";
import { createDefaultDeps } from "../agents/deps.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("twilio-adapter", () => {
  it("throws when credentials are missing", () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const deps = createDefaultDeps();
    expect(() => createTwilioAdapter(deps)).toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it("sends SMS successfully", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550001234");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }),
      ),
    );
    const deps = createDefaultDeps();
    const twilio = createTwilioAdapter(deps);
    await expect(
      twilio.sendSMS("+15559876543", "Test message"),
    ).resolves.not.toThrow();
  });

  it("throws on failed send", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550001234");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("Unauthorized", { status: 401 }),
      ),
    );
    const deps = createDefaultDeps();
    const twilio = createTwilioAdapter(deps);
    await expect(
      twilio.sendSMS("+15559876543", "Test message"),
    ).rejects.toThrow("Twilio send failed");
  });
});
