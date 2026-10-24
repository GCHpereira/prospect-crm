# Roteiro futuro (não implementado)

## Fase 2: conector MCP (não implementado)
- Servidor MCP remoto (HTTPS) como Route Handler do próprio app (`/api/mcp`).
- Ferramentas mínimas: `buscar_leads_existentes` (checagem de duplicados) e `cadastrar_leads` (lote ≤ 20, mesmo schema zod da importação, `origem='mcp'`).
- Autenticação: token dedicado e revogável (guardado só como hash) ou OAuth, conforme exigência do conector do Claude.
- Privilégio mínimo: o conector chama um endpoint dedicado (reaproveitando `importLeads`, que insere e só completa campos vazios); sem leitura ampla, sem update livre, sem delete. Autenticação por Access Service Token (hoje o servidor exige JWT com e-mail; precisaria de um caminho específico e restrito para service token).
- Resposta: resumo (criados, duplicados, inválidos).
- A verificar antes: como conectores personalizados autenticam hoje; se o Claude no Chrome usa conectores MCP junto com navegação; limites de tempo/tamanho por chamada.

## Fase 3: automação agendada (NÃO assumir que funciona)
Prova de conceito antes de depender:
1. Ferramenta `ping_poc` que só grava uma linha em `poc_log`.
2. Tarefa agendada do Claude chamando `ping_poc`.
3. Verificar: a tarefa enxerga o conector? Executa sem confirmação humana? Roda com o computador desligado? Qual o limite de execuções?
4. Só se passar, evoluir para `cadastrar_leads`. Se exigir confirmação a cada gravação, o fluxo vira semiautomático.
