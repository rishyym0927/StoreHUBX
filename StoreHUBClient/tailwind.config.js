/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "hsl(0 0% 100%)",
          dark: "hsl(222.2 84% 4.9%)",
        },
        fg: {
          DEFAULT: "hsl(222.2 84% 4.9%)",
          dark: "hsl(210 40% 98%)",
        },
      },
      borderRadius: {
        xl: "1rem",
      },
    },
  },
  plugins: [],
};
