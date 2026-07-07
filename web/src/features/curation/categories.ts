/**
 * The nine canonical extractor categories (from the glossary + engine).
 *
 * The live DB also contains a small tail of `general` and `event` rows the
 * extractor occasionally emits; we deliberately do NOT expose those as
 * recategorize targets — an operator using this page should be assigning
 * one of the nine documented labels.
 */
export const CURATION_CATEGORIES = [
  'technical',
  'decision',
  'preference',
  'personal',
  'activity',
  'correction',
  'temporal',
  'relationship',
  'reference',
] as const

export type CurationCategory = (typeof CURATION_CATEGORIES)[number]
