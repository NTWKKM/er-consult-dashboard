import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"],
  },
  {
    rules: {
      // Allow legitimate DOM-measurement and hydration effects while surfacing them as warnings
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
