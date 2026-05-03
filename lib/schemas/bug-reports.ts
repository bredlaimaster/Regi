/**
 * Zod schemas for the Settings → Support bug tracker.
 * Extracted out of `actions/bug-reports.ts` so tests can import them without
 * crossing the "use server" boundary (server-action files may only export
 * async functions).
 */
import { z } from "zod";
import { BUG_AREA_KEYS } from "@/lib/bug-areas";

/**
 * Valid affected-area key. Closed enum — must be one of the stable slugs from
 * `lib/bug-areas.ts`. New entries are added there, not anywhere else.
 */
const AreaKey = z.enum(BUG_AREA_KEYS as readonly [string, ...string[]]);

/** Optional URL that, if non-empty, must be a valid URL. */
const OptionalUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .optional()
  .or(z.literal(""))
  .nullable();

export const CreateBugReportSchema = z.object({
  description: z.string().trim().min(1, "Describe the bug").max(5000),
  affectedAreas: z.array(AreaKey).max(BUG_AREA_KEYS.length).default([]),
  driveLink: OptionalUrl,
  reporter: z.string().trim().max(120).optional().nullable(),
});

export const UpdateBugReportSchema = CreateBugReportSchema.extend({
  id: z.string().min(1),
});

export const ToggleSolvedSchema = z.object({
  id: z.string().min(1),
  solved: z.boolean(),
});

export const DeleteBugReportSchema = z.object({
  id: z.string().min(1),
});
