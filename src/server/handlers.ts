import { api, fail, getEnv, json, readJson } from "./auth";
import { addInteraction, createLead, deleteLead, getState, importLeads, RepoError, setTemplates, updateLead } from "./repo";
import { importSchema, interactionCreate, leadCreate, leadPatch, templatesSchema, uuid } from "./schemas";
import type { ZodType } from "zod";

const SMALL = 64 * 1024;
const IMPORT_MAX = 3 * 1024 * 1024;

async function body<T>(request: Request, schema: ZodType<T>, max = SMALL): Promise<T | Response> {
  const parsed = schema.safeParse(await readJson(request, max));
  return parsed.success ? parsed.data : fail(422, "validation_error");
}
const isRes = (x: unknown): x is Response => x instanceof Response;

// Erros de domínio (404/409) viram resposta JSON; o resto cai no tratamento genérico de api().
const guard = async (f: () => Promise<Response>) => {
  try {
    return await f();
  } catch (e) {
    if (e instanceof RepoError) return fail(e.status, e.message);
    throw e;
  }
};

export const stateGET = api(async () => json(await getState(getEnv().DB)));

export const leadsPOST = api(
  (req) =>
    guard(async () => {
      const b = await body(req, leadCreate);
      if (isRes(b)) return b;
      return json(await createLead(getEnv().DB, b as never), 201);
    }),
  true,
);

export const leadPATCH = api(
  (req, p) =>
    guard(async () => {
      if (!uuid.safeParse(p.id).success) return fail(404, "nao_encontrado");
      const b = await body(req, leadPatch);
      if (isRes(b)) return b;
      return json(await updateLead(getEnv().DB, p.id, b));
    }),
  true,
);

export const leadDELETE = api(
  (_req, p) =>
    guard(async () => {
      if (!uuid.safeParse(p.id).success) return fail(404, "nao_encontrado");
      await deleteLead(getEnv().DB, p.id);
      return json({ ok: true });
    }),
  true,
);

export const interactionsPOST = api(
  (req) =>
    guard(async () => {
      const b = await body(req, interactionCreate);
      if (isRes(b)) return b;
      return json(await addInteraction(getEnv().DB, b), 201);
    }),
  true,
);

export const templatesPUT = api(
  async (req) => {
    const b = await body(req, templatesSchema);
    if (isRes(b)) return b;
    return json(await setTemplates(getEnv().DB, b));
  },
  true,
);

export const importPOST = api(
  (req) =>
    guard(async () => {
      const b = await body(req, importSchema, IMPORT_MAX);
      if (isRes(b)) return b;
      return json(await importLeads(getEnv().DB, b as never));
    }),
  true,
);
