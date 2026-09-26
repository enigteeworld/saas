/** Supabase/PostgREST errors are plain objects (not Error instances) - read their message safely. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const candidate = err as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    if (parts.length > 0) return parts.join(' - ');
  }
  return fallback;
}
