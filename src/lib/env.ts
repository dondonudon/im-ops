/**
 * Validates that all required environment variables are present at startup.
 * Import this module in the root layout so missing vars fail fast with a
 * clear message rather than silently misfiring at runtime.
 */
const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

for (const key of required) {
	if (!process.env[key]) {
		throw new Error(`Missing required environment variable: ${key}. Check your .env.local file.`);
	}
}
