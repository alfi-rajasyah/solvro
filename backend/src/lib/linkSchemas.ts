import { z } from "zod";

// Label + plain http(s) URL document links, shared by the deal links
// (routes/opportunityItems.ts), project links (routes/projectLinks.ts) and
// customer links (routes/customerLinks.ts). Matches VeloraApp's
// opportunity_links contract (Velora's `documents` table stored
// file_name/file_url pairs that were always links, never uploads — see
// docs/archive/plans/pipeline-native-port-plan.md).
export const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "URL must be a valid http:// or https:// address");

export const linkLabelSchema = z.string().trim().min(1).max(200);

export const createLinkSchema = z.object({
  label: linkLabelSchema,
  url: httpUrlSchema,
});

export const updateLinkSchema = z.object({
  label: linkLabelSchema.optional(),
  url: httpUrlSchema.optional(),
});
