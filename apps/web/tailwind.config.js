module.exports = {
  purge: [],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {},
    listStyleType: {
      none: 'none',
     disc: 'disc',
     decimal: 'decimal',
     alpha: 'lower-alpha',
     roman: 'lower-roman',
    }
  },
  variants: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
    require('@tailwindcss/forms'),
  ],
}
