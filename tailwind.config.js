/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Webkul POS Desk brand palette
        brand: {
          DEFAULT: "#fc8019",
          50: "#fff2e8",
          100: "#ffe4cf",
          500: "#fc8019",
          600: "#e07014",
          700: "#e36803",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Poppins", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
}