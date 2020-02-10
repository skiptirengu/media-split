module.exports = {
  env: {
    node: true
  },
  parserOptions: {
    sourceType: 'module'
  },
  extends: 'standard',
  'rules': {
    // allow paren-less arrow functions
    'arrow-parens': 0,
    // allow async-await
    'generator-star-spacing': 0,
    // 2 lines
    'indent': ['error', 2],
    // require space on single line objects
    'object-curly-spacing': ['error', 'always'],
    // and arrays
    'array-bracket-spacing': ['error', 'always'],
    'computed-property-spacing': ['error', 'always']
  }
}
