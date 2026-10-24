import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": p("./src"), "cloudflare:workers": p("./src/test/cf-mock.ts") } },
  test: { include: ["src/**/*.test.ts"] },
});
