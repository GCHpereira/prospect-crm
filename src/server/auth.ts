import { env } from "cloudflare:workers";
import type { JWTVerifyGetKey } from "jose";
import { AccessError, verifyAccess } from "./access";
import type { AppEnv } from "./d1";

// Só para testes: substitui a busca remota das chaves do Access.
let keysOverride: ((teamDomain: string) => JWTVerifyGetKey) | undefined;
export const __setKeysForTests = (f?: (teamDomain: string) => JWTVerifyGetKey) => (keysOverride = f);

export const getEnv = (): AppEnv => env;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
export const fail = (status: number, error: string) => json({ error }, status);

/**
 * Exige usuário autenticado e autorizado. Toda rota /api chama isto primeiro.
 * Não confia em headers de identidade do navegador: só no JWT assinado pelo Cloudflare Access.
 */
export async function requireUser(request: Request): Promise<string> {
  const e = getEnv();
  // Atalho de desenvolvimento: só existe em `vite dev` (import.meta.env.DEV é false no build de produção).
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === "1") return "dev@localhost";
  const teamDomain = e.ACCESS_TEAM_DOMAIN;
  return verifyAccess(
    request.headers.get("cf-access-jwt-assertion"),
    { teamDomain, aud: e.ACCESS_AUD, allowedEmail: e.ALLOWED_EMAIL },
    keysOverride && teamDomain ? keysOverride(teamDomain.trim().toLowerCase()) : undefined,
  );
}

/**
 * Proteção CSRF para gravações: mesma origem + corpo JSON (formulários cross-site não conseguem).
 * DELETE não tem corpo (o navegador não envia content-type): vale só a checagem de origem.
 */
export function checkWrite(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return fail(403, "bad_origin");
  if (request.method !== "DELETE" && !(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return fail(415, "json_required");
  return null;
}

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new BodyError(413, "too_large");
  const text = await request.text();
  if (text.length > maxBytes) throw new BodyError(413, "too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400, "invalid_json");
  }
}

export class BodyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Envolve um handler: autentica, valida CSRF em gravações e converte erros em JSON sem vazar detalhes. */
export function api(handler: (request: Request, params: Record<string, string>, user: string) => Promise<Response>, write = false): Handler {
  return async (request, ctx) => {
    try {
      const user = await requireUser(request);
      if (write) {
        const bad = checkWrite(request);
        if (bad) return bad;
      }
      return await handler(request, (await ctx?.params) ?? {}, user);
    } catch (e) {
      if (e instanceof AccessError) return fail(e.status, e.message);
      if (e instanceof BodyError) return fail(e.status, e.message);
      if (e instanceof Response) return e;
      console.error("api_error", e instanceof Error ? e.name : "unknown", e instanceof Error ? e.message.slice(0, 200) : "");
      return fail(500, "internal_error");
    }
  };
}
