import { z } from 'zod'
export const sourceUrlSchema = z.string().url('Informe uma URL válida').refine((value)=>['http:','https:'].includes(new URL(value).protocol),'Use uma URL HTTP ou HTTPS')
export const aiResultSchema = z.object({title:z.string().min(3),caption:z.string().min(3),summary:z.string(),category_suggestion:z.string().nullable(),detected_facts:z.array(z.string()),warnings:z.array(z.string()),confidence:z.enum(['low','medium','high'])})
export const createNewsSchema = z.object({source_url:sourceUrlSchema,assigned_to:z.string().uuid().optional().or(z.literal('')),category_id:z.string().uuid().optional().or(z.literal('')),destination_page_id:z.string().uuid().optional().or(z.literal('')),editorial_tone:z.string().max(100).optional(),notes:z.string().max(2000).optional()})
export const publicationSchema = z.object({news_item_id:z.string().uuid().nullable().optional(),title:z.string().min(2),caption:z.string().optional(),platform:z.string().min(2),page_id:z.string().uuid().nullable().optional(),published_url:sourceUrlSchema,published_at:z.string().min(1),posted_by:z.string().uuid().nullable().optional(),credit_text:z.string().optional(),notes:z.string().optional()})
export const metricSchema = z.object({publication_id:z.string().uuid(),captured_at:z.string().min(1),views:z.number().int().min(0),reach:z.number().int().min(0),impressions:z.number().int().min(0),likes:z.number().int().min(0),comments:z.number().int().min(0),shares:z.number().int().min(0),saves:z.number().int().min(0),clicks:z.number().int().min(0),followers_gained:z.number().int().min(0)})
export type CreateNewsInput=z.infer<typeof createNewsSchema>
export type PublicationInput=z.infer<typeof publicationSchema>
export type MetricInput=z.infer<typeof metricSchema>
