# Prospect CRM

CRM privado para **prospecção comercial B2B**: reúne empresas encontradas em pesquisas (Google Maps, planilhas), organiza o funil, evita duplicados e abre a conversa no WhatsApp com a mensagem já preenchida, para que o tempo vá para a negociação, não para copiar telefone e montar planilha.

> **O sistema não envia mensagens.** Ele só abre o link oficial `wa.me` com o texto pronto; quem revisa e envia é você, manualmente. Não há automação do WhatsApp Web, robôs nem disparos em massa. "Abrir a conversa" e "enviar" são registrados separadamente: o envio só é marcado depois que você confirma.

Projeto de uso individual (um único usuário autorizado), construído como ferramenta real e publicado como portfólio.

## Funcionalidades

- **Funil comercial** com 10 estágios (novo, contato iniciado, aguardando resposta, respondeu, reunião marcada, proposta enviada, negociação, fechado, sem interesse, descartado) e troca rápida de status.
- **Painel** com os indicadores do funil e os acompanhamentos vencidos.
- **Leads** em cards (mobile) ou tabela (desktop), com busca por nome, filtros (status, nicho, cidade, pontuação) e ordenação (prioridade, avaliação, data).
- **Cadastro e edição** com validação: empresa, contato/decisor, qualificação (oportunidade, prioridade 0-100, justificativa, fonte, datas) e observações.
- **WhatsApp manual:** normaliza o telefone para o formato internacional, escolhe o número preferido (com fallback), monta a mensagem a partir de **templates editáveis** (com e sem decisor identificado) e pergunta "Você enviou?" ao voltar.
- **Histórico** de contatos: ligações, respostas, notas, próxima ação e data de acompanhamento; mudanças de status entram no histórico automaticamente.
- **Importação CSV/XLSX** com mapeamento de colunas (automático por nome, ajustável), prévia linha a linha, relatório e um **modelo padrão de colunas** (`public/modelo-leads.csv`) para quem gera as planilhas.
- **Prevenção de duplicados:** ID do Google Maps e CNPJ (com dígitos verificadores) são identificadores fortes; nome + cidade apenas **sinaliza** "possível duplicado", e a criação exige confirmação. Reimportar o mesmo arquivo não duplica, e a importação **nunca sobrescreve** campos já preenchidos nem `status` e observações.

## Stack

| Camada | Tecnologia |
|---|---|
| Interface | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Runtime | Cloudflare Workers, via [vinext](https://github.com/cloudflare/vinext) (reimplementação do Next.js sobre Vite) |
| Banco | Cloudflare D1 (SQLite) |
| Autenticação | Cloudflare Access (JWT validado no servidor com [`jose`](https://github.com/panva/jose)) |
| Validação | zod |
| Planilhas | papaparse (CSV), read-excel-file (XLSX) |
| Testes | Vitest (SQLite real via `node:sqlite`) |

## Arquitetura

```
Navegador (celular ou computador)
   │  HTTPS
   ▼
Cloudflare Access ──(login por e-mail; só o e-mail autorizado)──┐
   │ Cf-Access-Jwt-Assertion (JWT assinado)                      │
   ▼                                                             │
Worker "prospect-crm" (vinext)                                   │
   ├─ páginas (UI)                                               │
   └─ /api/*  → requireUser(): valida assinatura RS256, issuer,  │
                audience (AUD), validade e e-mail  ◄─────────────┘
                → zod → consultas parametrizadas → D1
```

- A interface mantém o estado em memória e o sincroniza com a API (`src/lib/store.tsx`): atualização otimista nas edições, e **exclusão confirmada pelo servidor** antes de remover da tela.
- Toda a lógica de dados fica no servidor (`src/server`): `auth.ts`/`access.ts` (autenticação), `schemas.ts` (entrada), `repo.ts` (D1), `handlers.ts` (rotas). O banco nunca é exposto ao navegador.
- As regras puras (telefone, mensagem, duplicidade, importação) ficam em `src/lib` e são compartilhadas entre a prévia no navegador e a revalidação no servidor.
- A importação grava em **uma transação** (`db.batch`) usando poucos comandos (`json_each`), por causa do limite de consultas por invocação do D1 gratuito.

## Segurança e privacidade

- **Fail-closed:** sem `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` e `ALLOWED_EMAIL` configurados, toda rota `/api` responde 503. Um token válido de outro e-mail recebe 403.
- **Não confia em headers soltos:** só o JWT assinado pelo Access vale; `cf-access-authenticated-user-email` e similares são ignorados.
- **Camada dupla:** o Access protege a URL (produção e prévias), e o servidor revalida o token mesmo assim; se o Access for desativado por engano, os dados continuam protegidos.
- **CSRF:** gravações exigem `Origin` igual ao do app (e corpo JSON, exceto `DELETE`, que não tem corpo).
- **Entrada:** zod em toda rota com whitelist de campos (campos de controle nunca vêm do cliente), limites de tamanho, `CHECK`s no banco e SQL sempre parametrizado. Células de planilha que começam com `=`, `+`, `-` ou `@` são neutralizadas.
- **Atalho de desenvolvimento:** `VITE_DEV_AUTH_BYPASS` só funciona em `npm run dev`; no build de produção o código é eliminado (`import.meta.env.DEV` é falso). Os testes verificam isso.
- **Sem sourcemaps** em produção, e nenhum segredo no bundle.
- **Privacidade:** o app guarda dados de contato de empresas e de pessoas (decisores). Se for usá-lo, cumpra a LGPD (finalidade, minimização, direito de exclusão) e as políticas do WhatsApp contra mensagens não solicitadas em volume. O repositório não contém dados reais.

A suíte tem 70 testes automatizados, entre eles autorização (token ausente, inválido, expirado, `alg=none`, audience/issuer errados, e-mail não autorizado, configuração ausente), CSRF, validação, injeção de SQL, persistência, exclusão em cascata e importação.

## Como rodar localmente

Requisitos: Node.js 22+ e npm. O config tipado da Cloudflare exige Node 22.18+; o projeto traz o pacote `node@22` como dependência de desenvolvimento, e os scripts `npm run` já o usam.

```bash
npm install
# Windows: se aparecer "Cannot find native binding" (bug do npm com dependências opcionais)
npm run fix:win

cp .env.example .env.local        # atalho de login só para o dev
cp .dev.vars.example .dev.vars    # valores de exemplo dos secrets

npm run dev                       # http://localhost:3000 (workerd + D1 local)
# em outro terminal, com o dev rodando:
node scripts/migrate-local.mjs    # cria as tabelas no D1 local
```

Nenhuma conta Cloudflare é necessária para rodar localmente. Comandos de teste e build: veja [Testes](#testes).

## Testes

```bash
npm test                          # 70 testes (Vitest)
npm run lint
npm run typecheck
npm run build                     # build de produção para Workers
node scripts/e2e-local.mjs        # API ponta a ponta no dev server (workerd + D1 local)
```

Os testes de servidor rodam as rotas reais sobre SQLite de verdade (mesmo motor do D1), com JWTs assinados por chaves geradas no teste. Cobrem autenticação e autorização, CSRF, validação de entrada, persistência, duplicados, importação/reimportação e exclusão.

## Variáveis de ambiente

| Nome | Onde | Para quê |
|---|---|---|
| `VITE_DEV_AUTH_BYPASS` | `.env.local` | Atalho de login, **só** `npm run dev` |
| `ACCESS_TEAM_DOMAIN` | `.dev.vars` / secret do Worker | `seuteam.cloudflareaccess.com` (Zero Trust) |
| `ACCESS_AUD` | `.dev.vars` / secret do Worker | Application Audience (AUD) tag do app no Access |
| `ALLOWED_EMAIL` | `.dev.vars` / secret do Worker | Único e-mail autorizado |
| `CLOUDFLARE_ACCOUNT_ID` | ambiente, no deploy | Conta onde o Worker será publicado |
| `D1_DATABASE_ID` | ambiente, no deploy (opcional) | Fixa o banco D1 já criado |

Nada de conta, banco ou domínio fica no repositório.

## Deploy na sua conta Cloudflare

Resumo (passo a passo em [`docs/deploy.md`](docs/deploy.md)):

1. Ative o Zero Trust (plano Free) e autentique o CLI: `npx cf auth login`.
2. Publique com os secrets iniciais (o 1º deploy exige os três; use um `ACCESS_AUD` provisório):
   `npx cf deploy --secrets-file <arquivo-fora-do-repositório>`
3. Aplique a migration no D1 criado: `npx cf d1 migrations apply <id-do-banco>`.
4. No painel, ative o **Cloudflare Access** no `workers.dev` e nas Preview URLs, com política Allow apenas para o seu e-mail.
5. Copie o AUD tag real e atualize o secret `ACCESS_AUD`.
6. **Valide com login real** (e com um e-mail não autorizado) antes de usar.

## Demonstração visual

Veja [`docs/screenshots/`](docs/screenshots/README.md) para o espaço reservado. Capturas devem usar **somente dados fictícios**.

<!--
| Desktop: leads | Mobile: lead e WhatsApp |
|---|---|
| ![Lista de leads](docs/screenshots/desktop-leads.png) | ![Detalhe do lead](docs/screenshots/mobile-lead.png) |
-->

## Limitações conhecidas

- **Um usuário só:** não há cadastro, papéis nem multi-tenant. O acesso é definido por um único e-mail.
- **Dependências em beta ou jovens:** `cf` (CLI), `@cloudflare/vite-plugin` e `vinext` ainda são beta/versões iniciais; comportamentos podem mudar. O `cf deploy` exige os secrets declarados já no primeiro deploy.
- **Windows:** o npm pode não instalar o binário nativo do `rolldown` (bug conhecido); use `npm run fix:win`.
- **Escala:** a interface carrega todos os leads e interações de uma vez (sem paginação). Serve para milhares de registros, não para dezenas de milhares. Os limites do plano gratuito do D1 (leituras/escritas por dia) se aplicam.
- **Importação:** até 500 linhas e 2 MB por arquivo.
- **Cobertura de testes:** a lógica e a API têm testes automatizados; a interface foi verificada manualmente (não há testes de UI automatizados). O fluxo com token real do Access só pode ser validado no deploy; nos testes ele usa chaves geradas localmente.
- **Sem limitação de taxa, trilha de auditoria ou backups automáticos** além do que o D1 oferece.
- **`npm audit`:** pode listar avisos em ferramentas de build/lint (por exemplo `braces`, `fflate`); não vão para o Worker, mas acompanhe as atualizações.
- **Roteiro não implementado:** [`docs/futuro.md`](docs/futuro.md) descreve integrações futuras (conector MCP, automações agendadas), que dependem de provas de conceito.

## Licença

[MIT](LICENSE).
