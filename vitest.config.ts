import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Run in Node environment — our unit tests are pure functions with no
		// DOM / browser dependencies. Faster than jsdom and sufficient here.
		environment: "node",
		globals: true,
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/lib/**/*.ts"],
			exclude: ["src/lib/supabase/**", "src/lib/gcal/**"],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
