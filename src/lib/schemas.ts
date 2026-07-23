import { z } from "zod";
export const sourceUrlSchema = z
  .string()
  .url("Informe uma URL válida")
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Use uma URL HTTP ou HTTPS");
const optionalUuid = z.string().uuid().or(z.literal("")).nullable().optional();
export const aiResultSchema = z.object({
  title: z.string().min(3),
  caption: z.string().min(3),
  highlight: z.string().min(2).max(50),
  editorial_tone: z.string().min(2).max(100),
  summary: z.string(),
  category_suggestion: z.string().nullable(),
  detected_facts: z.array(z.string()),
  warnings: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});
export const createNewsSchema = z.object({
  source_url: sourceUrlSchema,
  transcribe_audio: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});
export const publicationSchema = z.object({
  news_item_id: optionalUuid,
  page_id: optionalUuid,
  published_url: sourceUrlSchema,
});
export const metricSchema = z.object({
  publication_id: z.string().uuid(),
  captured_at: z.string().min(1),
  views: z.number().int().min(0),
  reach: z.number().int().min(0),
  impressions: z.number().int().min(0),
  likes: z.number().int().min(0),
  comments: z.number().int().min(0),
  shares: z.number().int().min(0),
  saves: z.number().int().min(0),
  reposts: z.number().int().min(0),
  clicks: z.number().int().min(0),
  followers_gained: z.number().int().min(0),
});
export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type PublicationInput = z.infer<typeof publicationSchema>;
export type MetricInput = z.infer<typeof metricSchema>;
