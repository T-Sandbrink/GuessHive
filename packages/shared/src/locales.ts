import { z } from 'zod';

/** UI locales supported at launch (BCP 47). Add more here; see AGENTS.md §10. */
export const SUPPORTED_LOCALES = ['nl', 'en'] as const;

export const localeSchema = z.enum(SUPPORTED_LOCALES);

export type Locale = z.infer<typeof localeSchema>;
