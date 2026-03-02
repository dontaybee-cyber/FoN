import { describe, it, expect, vi, afterEach } from "vitest";
import { createResendMailer } from "./resend-mailer.js";
import { createDefaultDeps } from "../agents/deps.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resend-mailer", () => {
  it("throws when RESEND_API_KEY is missing", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const deps = createDefaultDeps();
    expect(() => createResendMailer(deps)).toThrow(/RESEND_API_KEY/);
  });

  it("sends email successfully", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("AGENCY_EMAIL", "test@dbai.agency");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "123" }), { status: 200 })),
    );
    const deps = createDefaultDeps();
    const mailer = createResendMailer(deps);
    await expect(
      mailer.send({ to: "lead@test.com", subject: "Test", html: "<p>Test</p>" }),
    ).resolves.not.toThrow();
  });

  it("throws on failed send", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401 })),
    );
    const deps = createDefaultDeps();
    const mailer = createResendMailer(deps);
    await expect(
      mailer.send({ to: "lead@test.com", subject: "Test", html: "<p>Test</p>" }),
    ).rejects.toThrow("Resend failed");
  });
});
