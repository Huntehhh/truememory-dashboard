import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class strings, resolving conflicts.
 * Standard shadcn-style helper used by every primitive.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
