import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "drizzle/**", "playwright-report/**", "test-results/**", ".data/**"] },
];

export default config;
