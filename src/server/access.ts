import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type AccessConfig = { teamDomain: string; aud: string; allowedEmail: string };

const TEAM_RE = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

export class AccessError extends Error {
  constructor(public status: 401 | 403 | 503, message: string) {
    super(message);
  }
}

const remote = new Map<string, JWTVerifyGetKey>();
/** Chaves públicas do Access, buscadas em tempo de execução (rotacionam a cada ~6 semanas). */
export function remoteKeys(teamDomain: string): JWTVerifyGetKey {
  let k = remote.get(teamDomain);
  if (!k) {
    k = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    remote.set(teamDomain, k);
  }
  return k;
}

/**
 * Valida o JWT do Cloudflare Access (header Cf-Access-Jwt-Assertion): assinatura RS256, issuer,
 * audience (AUD do app), expiração e e-mail autorizado. Devolve o e-mail. Lança AccessError caso contrário.
 */
export async function verifyAccess(token: string | null, cfg: Partial<AccessConfig>, keys?: JWTVerifyGetKey): Promise<string> {
  const teamDomain = (cfg.teamDomain ?? "").trim().toLowerCase();
  const aud = (cfg.aud ?? "").trim();
  const allowed = (cfg.allowedEmail ?? "").trim().toLowerCase();
  // Configuração ausente ou inválida = fecha tudo (fail-closed).
  if (!TEAM_RE.test(teamDomain) || !aud || !allowed.includes("@")) throw new AccessError(503, "access_not_configured");
  if (!token) throw new AccessError(401, "missing_token");
  try {
    const { payload } = await jwtVerify(token, keys ?? remoteKeys(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience: aud,
      algorithms: ["RS256"],
      clockTolerance: 5,
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!email) throw new AccessError(403, "no_email");
    if (email !== allowed) throw new AccessError(403, "email_not_allowed");
    return email;
  } catch (e) {
    if (e instanceof AccessError) throw e;
    throw new AccessError(401, "invalid_token");
  }
}
