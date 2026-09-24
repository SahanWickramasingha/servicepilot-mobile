const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const importPlugin = require("eslint-plugin-import");

module.exports = [
  {
    ignores: [
      "lib/**",
      "generated/**",
      "node_modules/**",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.ts"],
    languageOptions: {
      ecmaVersion: 2017,
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./tsconfig.dev.json",
        ],
        tsconfigRootDir: __dirname,
      },
      globals: {
        Buffer: "readonly",
        console: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      quotes: ["error", "double"],
      indent: ["error", 2],
      "import/no-unresolved": "off",
    },
  },
];
