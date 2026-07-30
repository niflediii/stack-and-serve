import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101415",
        panel: "#1d2022",
        volt: "#caf300",
        mist: "#e0e3e5",
      },
      fontFamily: {
        head: ["var(--font-montserrat)"],
        body: ["var(--font-inter)"],
      },
    },
  },
  plugins: [],
};

export default config;
