import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "rgb(var(--sourcehub-navy-950) / <alpha-value>)",
          900: "rgb(var(--sourcehub-navy-900) / <alpha-value>)",
          800: "rgb(var(--sourcehub-navy-800) / <alpha-value>)",
        },
        skybrand: {
          500: "rgb(var(--sourcehub-sky-500) / <alpha-value>)",
        },
        sourcehub: {
          bg: "rgb(var(--sourcehub-bg) / <alpha-value>)",
          surface: "rgb(var(--sourcehub-surface) / <alpha-value>)",
          muted: "rgb(var(--sourcehub-muted) / <alpha-value>)",
          border: "rgb(var(--sourcehub-border) / <alpha-value>)",
          text: "rgb(var(--sourcehub-text) / <alpha-value>)",
          primary: "rgb(var(--sourcehub-primary) / <alpha-value>)",
          secondary: "rgb(var(--sourcehub-secondary) / <alpha-value>)",
          accent: "rgb(var(--sourcehub-accent) / <alpha-value>)",
        },
      },
      boxShadow: {
        soft: "0 18px 50px rgba(9, 32, 88, 0.12)",
        glow: "0 0 0 1px rgba(11, 188, 235, 0.18), 0 20px 60px rgba(9, 32, 88, 0.15)",
      },
      backgroundImage: {
        "sourcehub-radial":
          "radial-gradient(circle at top left, rgba(11,188,235,0.20), transparent 30%), radial-gradient(circle at top right, rgba(15,70,176,0.18), transparent 34%), linear-gradient(180deg, rgba(230,235,242,0.9), rgba(230,235,242,1))",
      },
    },
  },
  plugins: [],
};

export default config;
