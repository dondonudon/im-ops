// Test stub for the `server-only` package. The real package throws when
// imported outside a server bundle, which breaks vitest's node environment.
// vitest.config.ts aliases "server-only" to this no-op so server-only modules
// (e.g. the SEO client) can be unit-tested.
export {};
