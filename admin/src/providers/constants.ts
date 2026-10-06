export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_API_URL ||
  "https://REDACTED_SUPABASE_PROJECT_ID.supabase.co";

export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_API_KEY ||
  "REDACTED_SUPABASE_ANON_KEY";
