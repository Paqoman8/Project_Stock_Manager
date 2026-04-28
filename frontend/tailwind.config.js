/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F8F9FA",
        surface: "#FFFFFF",
        textMain: "#212529",
        textMuted: "#6C757D",
        textPrimary: "#212529",
        textSecondary: "#6C757D",
        primary: "#0D6EFD",
        borderLight: "#DEE2E6",
        success: "#198754",
        warning: "#FFC107",
        danger: "#DC3545",
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'San Francisco', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
