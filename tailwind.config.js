/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gt: { gold: '#B3A369', navy: '#003057' },
      },
    },
  },
  plugins: [],
}
