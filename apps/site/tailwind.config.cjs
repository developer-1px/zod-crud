/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../outliner/src/**/*.{ts,tsx}",
    "../mobile-cms/src/**/*.{ts,tsx}",
  ],
  safelist: [
    "zc-outliner-mode-edit",
    "zc-outliner-toast-error",
    "zc-outliner-toast-info",
  ],
  theme: { extend: {} },
  plugins: [],
};
