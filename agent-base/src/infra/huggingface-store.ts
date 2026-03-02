import type { AgentDeps } from "../agents/deps.js";
import { enrichLead } from "./phone-enricher.js";

export type HuggingFaceLead = {
  URL: string;
  Pain_Point_Summary: string;
  Status: string;
  Email: string;
  Facebook: string;
  LinkedIn: string;
  Instagram: string;
  Twitter: string;
  Contact_Page: string;
  phone?: string;
};

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "negotiating"
  | "closed"
  | "unresponsive";

export function createHuggingFaceStore(deps: AgentDeps) {
  const token = process.env["HUGGINGFACE_TOKEN"];
  const dataset =
    process.env["HUGGINGFACE_DATASET"] ?? "DontayBeemon/dbai-vault";

  if (!token) {
    throw new Error("HUGGINGFACE_TOKEN is required.");
  }

  async function listDatasetFiles(): Promise<Array<{ path: string; type: string }>> {
    const url = `https://huggingface.co/api/datasets/${dataset}/tree/main`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`HuggingFace tree fetch failed: ${response.status}`);
    }
    return response.json() as Promise<Array<{ path: string; type: string }>>;
  }

  async function fetchCSV(path: string): Promise<string> {
    const url = `https://huggingface.co/datasets/${dataset}/resolve/main/${path}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`HuggingFace file fetch failed: ${response.status}`);
    }
    return response.text();
  }

  function normalizeHeaders(headers: string[]): string[] {
    return headers.map((header) => {
      const clean = header.trim().replace(/^"|"$/g, "").toLowerCase();
      if (clean === "url" || clean === "website") return "URL";
      if (clean === "email" || clean === "email_address") return "Email";
      if (
        clean === "pain_point_summary" ||
        clean === "pain points" ||
        clean === "pain_points"
      ) {
        return "Pain_Point_Summary";
      }
      if (clean === "status") return "Status";
      if (clean === "facebook") return "Facebook";
      if (clean === "linkedin") return "LinkedIn";
      if (clean === "instagram") return "Instagram";
      if (clean === "twitter") return "Twitter";
      if (
        clean === "contact_page" ||
        clean === "contact page" ||
        clean === "contact"
      ) {
        return "Contact_Page";
      }
      if (clean === "phone" || clean === "phone_number") return "phone";
      return header.trim().replace(/^"|"$/g, "");
    });
  }

  function parseCSV(text: string): HuggingFaceLead[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const rawHeaders = parseCSVLine(lines[0] ?? "");
    const headers = normalizeHeaders(rawHeaders);
    deps.log.info(`[HuggingFace] CSV headers: ${headers.join(", ")}`);

    return lines
      .slice(1)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const values = parseCSVLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, i) => {
          row[header] = (values[i] ?? "").trim().replace(/^"|"$/g, "");
        });
        return row as unknown as HuggingFaceLead;
      })
      .filter((lead) => lead.URL || lead.Email);
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  return {
    async getNewLeads(): Promise<HuggingFaceLead[]> {
      const LEADS_FILE = "leads_queue_DONNY_B_MASTER_2026.csv";

      deps.log.info(`[HuggingFace] Fetching ${LEADS_FILE} from ${dataset}`);

      let csvText: string;
      try {
        csvText = await fetchCSV(LEADS_FILE);
      } catch {
        const files = await listDatasetFiles();
        deps.log.info(
          `[HuggingFace] Files found: ${files.map((f) => f.path).join(", ")}`,
        );
        const match = files.find((f) => f.path.includes("leads_queue"));
        if (!match) {
          deps.log.warn(`[HuggingFace] leads_queue CSV not found in dataset`);
          return [];
        }
        csvText = await fetchCSV(match.path);
      }

      const allLeads = parseCSV(csvText);

      const newLeads = allLeads.filter(
        (lead) =>
          !lead.Status ||
          lead.Status.toLowerCase() === "new" ||
          lead.Status.toLowerCase() === "processed" ||
          lead.Status.trim() === "",
      );

      deps.log.info(
        `[HuggingFace] Found ${newLeads.length} new leads out of ${allLeads.length} total`,
      );

      deps.log.info(
        `[HuggingFace] Enriching ${newLeads.length} leads...`,
      );

      const enriched: HuggingFaceLead[] = [];
      for (const lead of newLeads) {
        try {
          const result = await enrichLead(lead, deps);
          if (result.Email) {
            enriched.push(result);
          } else {
            deps.log.warn(
              `[HuggingFace] Skipping ${lead.URL} — no email found after enrichment`,
            );
          }
        } catch {
          deps.log.warn(`[HuggingFace] Enrichment failed for ${lead.URL}`);
        }
      }

      deps.log.info(
        `[HuggingFace] ${enriched.length} leads enriched with contact data`,
      );

      return enriched;
    },

    async updateLeadStatus(
      email: string,
      status: LeadStatus,
      extra?: Partial<HuggingFaceLead>,
    ): Promise<void> {
      deps.log.info(
        `[HF] Status update: ${email} → ${status}`,
        extra ?? {},
      );
    },
  };
}
