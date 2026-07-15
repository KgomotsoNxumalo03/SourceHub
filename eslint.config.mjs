import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      ".next/**",
      ".tmp-pkgs/**",
      "node_modules/**",
      "prisma/migrations/**",
      "**/*.tgz",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
      },
    },
  },
];
