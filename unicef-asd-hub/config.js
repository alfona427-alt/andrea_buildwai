// Supabase Credentials
// Replace these placeholders with your actual keys from your Supabase Dashboard
export const SUPABASE_URL = "https://ygipfasaddgitqnfzcjx.supabase.co/rest/v1/";
export const SUPABASE_ANON_KEY = "sb_publishable_K_bkPgrAcNBNcOjh9NSrpA_YgNIuuFT";

// Initialize Supabase Client
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);