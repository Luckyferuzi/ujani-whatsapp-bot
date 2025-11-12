import type { Config } from 'tailwindcss';

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ui: {
          bg: "#0B0D10",
          panel: "#14181D",
          soft: "#1B2128",
          border: "#2A323C",
          primary: "#58A6FF",
          text: "#E6EDF3",
          dim: "#9BA3AF",
          success: "#3FB950",
          warn: "#D29922",
          danger: "#F85149",
        }
      }
    },
  },
  plugins: [],
} satisfies Config;
