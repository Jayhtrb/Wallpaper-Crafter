/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff9ff",
          400: "#38b6ff",
          500: "#0ea5e9",
          600: "#0284c7",
          900: "#0c3a52",
        },
      },
    },
  },
  plugins: [],
};
