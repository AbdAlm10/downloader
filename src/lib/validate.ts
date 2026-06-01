import { z } from "zod";
import { ar } from "./ar";
import { ALLOWED_EXTENSIONS } from "./mime";
import { assertPublicHttpUrl } from "./security/url";
import { YT_FORMAT_SPECS } from "./youtube-formats";

const NUMERIC_FORMAT_ID = /^[a-zA-Z0-9+._:-]+$/;

function isAllowedFormatId(id: string): boolean {
  if (id in YT_FORMAT_SPECS) return true;
  if (/^piped-(?:v|vo|a)-[\w-]+$/.test(id)) return true;
  if (/^inn-(?:a-)?[\w-]+$/.test(id)) return true;
  return id.length <= 64 && NUMERIC_FORMAT_ID.test(id);
}

const urlSchema = z
  .string()
  .trim()
  .min(8, ar.urlTooShort)
  .max(2048, ar.urlTooLong)
  .superRefine((val, ctx) => {
    try {
      assertPublicHttpUrl(val);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : ar.urlInvalid,
      });
    }
  });

const extSchema = z
  .string()
  .max(10)
  .optional()
  .transform((v) => v?.toLowerCase())
  .refine((v) => !v || ALLOWED_EXTENSIONS.has(v), ar.invalidExtension);

export const infoBodySchema = z.object({
  url: urlSchema,
});

export const downloadPrepareSchema = z.object({
  url: urlSchema,
  formatId: z
    .string()
    .min(1)
    .max(64)
    .refine(isAllowedFormatId, ar.formatIdInvalid),
  title: z.string().max(200).optional(),
  ext: extSchema,
  merge: z.boolean().optional(),
});

export const downloadQuerySchema = z
  .object({
    token: z.string().uuid({ message: ar.invalidParams }).optional(),
    url: urlSchema.optional(),
    formatId: z
      .string()
      .min(1)
      .max(64)
      .refine(isAllowedFormatId, ar.formatIdInvalid)
      .optional(),
    directUrl: urlSchema.optional(),
    title: z.string().max(200).optional(),
    ext: extSchema,
    merge: z.enum(["true", "false"]).optional(),
  })
  .refine((d) => d.token || d.directUrl || d.url, { message: ar.urlOrDirectRequired })
  .refine((d) => d.token || d.formatId, { message: ar.formatIdInvalid });

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || ar.defaultFilename
  );
}
