/// <reference types="vite/client" />
declare module "cloudflare:workers" {
  export const env: import("./d1").AppEnv;
}
