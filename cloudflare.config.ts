import { bindings, defineConfig, defineWorker } from "cf/config";

// Nada específico de uma conta fica no repositório.
// - Conta: variável de ambiente CLOUDFLARE_ACCOUNT_ID (ou `cf auth login`) na hora do deploy.
// - Banco D1: no primeiro deploy o `cf deploy` cria o banco "prospect-crm" (--provision).
//   Depois, para fixar o banco, exporte D1_DATABASE_ID com o ID mostrado por `cf d1 list`.
const d1Id = process.env.D1_DATABASE_ID;

export default defineConfig({
  worker: defineWorker({
    name: "prospect-crm",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-22",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1(d1Id ? { id: d1Id } : { name: "prospect-crm" }),
      // Secrets: no painel (Settings > Variables and Secrets), `--secrets-file` no 1º deploy,
      // ou em `.dev.vars` no desenvolvimento local. Sem eles a API recusa tudo (fail-closed).
      ACCESS_TEAM_DOMAIN: bindings.secret(), // ex.: meuteam.cloudflareaccess.com
      ACCESS_AUD: bindings.secret(), // Application Audience (AUD) tag do app no Access
      ALLOWED_EMAIL: bindings.secret(), // único e-mail autorizado
    },
  }),
});
