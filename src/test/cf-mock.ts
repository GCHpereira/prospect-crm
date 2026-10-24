// Substitui "cloudflare:workers" nos testes (vitest roda em Node, sem workerd).
import type { AppEnv } from "@/server/d1";
export const env = {} as AppEnv;
