import { z } from "zod";
import { ar } from "./ar";
import { ALLOWED_EXTENSIONS } from "./mime";
import { assertPublicHttpUrl } from "./security/url";

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

export const downloadQuerySchema = z
  .object({
    url: urlSchema.optional(),
    formatId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9+._:-]+$/, ar.formatIdInvalid),
    directUrl: urlSchema.optional(),
    title: z.string().max(200).optional(),
    ext: extSchema,
    merge: z.enum(["true", "false"]).optional(),
  })
  .refine((d) => d.directUrl || d.url, { message: ar.urlOrDirectRequired });

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || ar.defaultFilename
  );
}
