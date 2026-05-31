import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        foreground: "var(--text)",

        /* ── Semantic, token-backed — the redesign palette ──────────────── */
        /* Surfaces */
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          sunken: "var(--surface-sunken)",
        },
        subtle: "var(--bg-subtle)",
        /* Lines: border-line, border-line-strong */
        line: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        /* Text: text-ink, text-ink-muted, text-ink-faint */
        ink: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        /* Brand/primary (token-backed, theme-aware) */
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          fg: "var(--primary-fg)",
          subtle: "var(--primary-subtle)",
          text: "var(--primary-text)",
        },
        success: {
          DEFAULT: "var(--success)",
          bg: "var(--success-bg)",
          text: "var(--success-text)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          bg: "var(--warning-bg)",
          text: "var(--warning-text)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          bg: "var(--danger-bg)",
          text: "var(--danger-text)",
        },

        /* ── Brand scale — cobalt (static; legacy + utility use) ─────────── */
        brand: {
          50: "#eff4ff",
          100: "#dbe6fe",
          200: "#bfd3fe",
          300: "#93b4fd",
          400: "#608ffa",
          500: "#3b6cf6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        /* navy retained only for legacy un-migrated screens */
        navy: {
          700: "#253047",
          800: "#1a2236",
          900: "#111827",
          950: "#0a0f1a",
        },
      },
      boxShadow: {
        token: "var(--shadow)",
        "token-sm": "var(--shadow-sm)",
        "token-md": "var(--shadow-md)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      keyframes: {
        "progress-indeterminate": {
          "0%":   { transform: "translateX(-100%) scaleX(0.4)" },
          "50%":  { transform: "translateX(0%) scaleX(0.6)" },
          "100%": { transform: "translateX(100%) scaleX(0.4)" },
        },
        "fade-in-up": {
          "0%":   { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "progress-indeterminate": "progress-indeterminate 1.1s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
