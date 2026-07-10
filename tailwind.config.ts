import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Diacto brand palette — the ONLY colors used across the site.
        brand: {
          gold: "#C0913C", // primary accent — CTAs, highlights, icons
          "gold-light": "#E5C878", // subtle gradients, hover states
          black: "#121212", // header, footer, hero text
          charcoal: "#2A2A2A", // body headings
          grey: "#6B6B6B", // secondary text
          cream: "#F8F6F2", // alternate section backgrounds
          white: "#FFFFFF",
        },
      },
      fontFamily: {
        // Wired to next/font CSS variables set in app/layout.tsx
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
