# Deploy (Cloudflare Workers + D1 + Access)

Guia para publicar o Prospect CRM **na sua própria conta Cloudflare**. Tudo cabe nos planos gratuitos (Workers Free, D1 Free, Zero Trust Free).

## O que será criado

- Um Worker chamado `prospect-crm`.
- Um banco D1 chamado `prospect-crm`.
- Um aplicativo Cloudflare Access protegendo o Worker, com política que permite só o seu e-mail.

> Se a sua conta tem outros Workers ou sites, **não** use a opção "Protect all Workers" do painel: ela aplicaria o Access a todos. Ative o Access apenas no Worker `prospect-crm`.

## Pré-requisitos

- Node.js 22+ e as dependências instaladas (`npm install`; no Windows, `npm run fix:win` se necessário).
- Conta Cloudflare com o **Zero Trust** ativado (plano Free). Anote o *team domain*: `SEUTEAM.cloudflareaccess.com`.
- CLI autenticado: `npx cf auth login` (abre o navegador; a credencial fica só na sua máquina).
- ID da sua conta: variável `CLOUDFLARE_ACCOUNT_ID` (visível no painel).

## 1. Primeiro deploy

O `cf deploy` recusa a primeira versão de um Worker novo sem os secrets declarados em `cloudflare.config.ts`. Como o `ACCESS_AUD` só existe depois que o Access é criado, use um valor **provisório**. Ele é seguro: nenhum token tem essa audience, então a API recusa tudo até você trocá-lo.

Crie um arquivo **fora do repositório** (por exemplo, `~/prospect-secrets.env`):

```
ACCESS_TEAM_DOMAIN=SEUTEAM.cloudflareaccess.com
ACCESS_AUD=PENDENTE-CONFIGURAR-ACCESS
ALLOWED_EMAIL=voce@example.com
```

Publique e apague o arquivo em seguida:

```bash
export CLOUDFLARE_ACCOUNT_ID=<id-da-sua-conta>
npx cf deploy --secrets-file ~/prospect-secrets.env
rm ~/prospect-secrets.env
```

Sem `.dev.vars` nem `.env.local` na pasta durante o deploy (mova-os temporariamente), para que valores de desenvolvimento não sejam enviados.

O `cf deploy` provisiona sozinho os bindings que faltam (`--provision`), então ele deve criar o banco D1 `prospect-crm`. Confira com `npx cf d1 list`; se o banco não existir, crie-o (`npx cf d1 create --name prospect-crm`), exporte `D1_DATABASE_ID` e repita o deploy. Anote a URL `https://prospect-crm.<seu-subdominio>.workers.dev` impressa no final.

Opcional: fixe o banco criado nos deploys seguintes com `export D1_DATABASE_ID=<id>` (veja `npx cf d1 list`).

Neste ponto a API responde 401/503 a tudo, e nenhum dado está exposto.

## 2. Migration do banco

```bash
npx cf d1 list                                    # copie o ID do banco prospect-crm
npx cf d1 migrations apply <id-do-banco>          # aplica migrations/0001_init.sql
```

A migration só cria tabelas e índices. Confira com `npx cf d1 query <id> --sql "SELECT name FROM sqlite_master"`.

## 3. Cloudflare Access (painel)

1. Workers & Pages > `prospect-crm` > Settings > Domains & Routes > **workers.dev** > *Enable Cloudflare Access*. Faça o mesmo em **Preview URLs**.
2. Edite a política criada: **Allow > Emails > o seu e-mail**, e mais nada.
3. Zero Trust > Access > Applications > (o app do Worker): copie o **Application Audience (AUD) Tag**.

## 4. Secret `ACCESS_AUD` real

Painel > Worker > Settings > Variables and Secrets > `ACCESS_AUD`: cole o AUD tag (tipo **Secret**) e faça o deploy da nova versão.

Confirme o `ACCESS_TEAM_DOMAIN` com cuidado: o team domain real é o que aparece na URL de login do Access (um erro de digitação faz todo login falhar com 401).

## 5. Deploys seguintes

Para publicar uma atualização sem reenviar secrets, suba uma versão sem promovê-la, confira que os três bindings `secret_text` vieram junto e só então ative:

```bash
npx cf workers versions create --message "descrição"
npx cf workers versions get <version-id> --worker-id prospect-crm      # os 3 secrets devem aparecer
npx cf workers deployments create --worker prospect-crm --strategy percentage \
  --versions '[{"version_id":"<version-id>","percentage":100}]'
```

Reverter = ativar de novo a versão anterior da mesma forma.

## 6. Validação obrigatória

1. Janela anônima: a URL do Worker deve redirecionar para o login do Access.
2. Com um e-mail **não** autorizado: deve ser barrado.
3. `curl -i https://prospect-crm.<seu-subdominio>.workers.dev/api/state` sem cookie: **não** pode devolver JSON (redirecionamento do Access ou 401 do app).
4. Com seu e-mail, no console do navegador: `fetch('/api/state').then(r => r.status)` deve dar **200**. Se der 401/403, confira `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` e `ALLOWED_EMAIL`.
5. Cadastre um lead fictício no computador e confira no celular.

## Limites do plano gratuito

- D1: 5 milhões de leituras e 100 mil escritas por dia, 5 GB. Acima disso as consultas são bloqueadas até 00:00 UTC (sem cobrança).
- D1 gratuito: 50 consultas por invocação do Worker (a importação usa poucas, por usar `json_each`).
- Workers Free: 100 mil requisições por dia.

Confira os valores atuais na documentação da Cloudflare, pois os planos mudam.

## Desenvolvimento local (sem conta Cloudflare)

Veja o [README](../README.md#como-rodar-localmente).
