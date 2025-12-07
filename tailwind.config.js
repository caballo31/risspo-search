/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "orange-highlight": "var(--orange-highlight)",
        "trustworthy-blue": "var(--trustworthy-blue)",
        "light-grey": "var(--light-grey-bg)",
      },
      fontFamily: {
        display: ["Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

