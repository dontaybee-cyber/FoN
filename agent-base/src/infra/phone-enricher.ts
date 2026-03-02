import type { AgentDeps } from "../agents/deps.js";
import type { HuggingFaceLead } from "./huggingface-store.js";

export type EnrichedLead = HuggingFaceLead & {
  email_found: boolean;
  phone_found: boolean;
};

const CONTACT_PAGE_PATHS = [
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/get-in-touch",
  "/reach-us",
  "/connect",
];

const FETCH_TIMEOUT_MS = 8000;

async function safeFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractEmails(html: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = html.match(emailRegex) ?? [];
  return [...new Set(matches)].filter(
    (email) =>
      !email.includes("example.com") &&
      !email.includes("domain.com") &&
      !email.includes("email.com") &&
      !email.includes("sentry") &&
      !email.includes("wixpress") &&
      !email.endsWith(".png") &&
      !email.endsWith(".jpg"),
  );
}

function extractPhones(html: string): string[] {
  const phoneRegex =
    /(?:\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
  const matches = html.match(phoneRegex) ?? [];
  return [...new Set(matches)].map((phone) => phone.replace(/[^0-9+]/g, ""));
}

function extractDescription(html: string): string {
  const metaMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']{20,300})["']/i,
  );
  if (metaMatch?.[1]) return metaMatch[1];

  const ogMatch = html.match(
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']{20,300})["']/i,
  );
  if (ogMatch?.[1]) return ogMatch[1];

  const pMatch = html.match(/<p[^>]*>([^<]{40,300})<\/p>/i);
  if (pMatch?.[1]) return pMatch[1].trim();

  return "";
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.origin;
  } catch {
    return url;
  }
}

export async function enrichLead(
  lead: HuggingFaceLead,
  deps: AgentDeps,
): Promise<HuggingFaceLead> {
  const baseUrl = normalizeUrl(lead.URL);
  deps.log.info(`[Enricher] Enriching ${baseUrl}`);

  let emails: string[] = [];
  let phones: string[] = [];
  let description = "";
  let contactPageUrl = "";

  const homeHtml = await safeFetch(baseUrl);
  if (homeHtml) {
    emails.push(...extractEmails(homeHtml));
    phones.push(...extractPhones(homeHtml));
    description = extractDescription(homeHtml);

    const contactLinkMatch = homeHtml.match(
      /href=["']([^"']*contact[^"']*)["']/i,
    );
    if (contactLinkMatch?.[1]) {
      const href = contactLinkMatch[1];
      contactPageUrl = href.startsWith("http")
        ? href
        : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
    }
  }

  const contactUrls = contactPageUrl
    ? [contactPageUrl]
    : CONTACT_PAGE_PATHS.map((path) => `${baseUrl}${path}`);

  for (const contactUrl of contactUrls.slice(0, 3)) {
    const html = await safeFetch(contactUrl);
    if (html) {
      emails.push(...extractEmails(html));
      phones.push(...extractPhones(html));
      if (!description) description = extractDescription(html);
      break;
    }
  }

  emails = [...new Set(emails)];
  phones = [...new Set(phones)];

  const enriched: HuggingFaceLead = {
    ...lead,
    Email: emails[0] ?? "",
    phone: phones[0] ?? "",
    Contact_Page: contactPageUrl,
    Pain_Point_Summary: description || `Business website at ${baseUrl}`,
    Facebook: "",
    LinkedIn: "",
    Instagram: "",
    Twitter: "",
  };

  deps.log.info(
    `[Enricher] ${baseUrl} — email: ${enriched.Email || "not found"}, phone: ${enriched.phone || "not found"}`,
  );

  return enriched;
}

export async function enrichPhoneNumber(
  lead: HuggingFaceLead,
  deps: AgentDeps,
): Promise<string | null> {
  const enriched = await enrichLead(lead, deps);
  return enriched.phone ?? null;
}
