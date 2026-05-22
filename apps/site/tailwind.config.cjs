/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../outliner/src/**/*.{ts,tsx}",
  ],
  safelist: [
    "toast-error",
    "toast-info",
  ],
  theme: { extend: {} },
  plugins: [],
};
