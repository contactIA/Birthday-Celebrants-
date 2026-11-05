# 0006 — Resumo de uso para a Mensageria

- **Status:** Aceito
- **Data:** 2026-11-05
- **Origem:** a ADR 0008 da Mensageria (`contactIA/Mensageria-CRM-ContactIA`,
  `docs/adr/0008-agente-e-os-nossos-sistemas.md`), item 3 ("Lembretes e
  Aniversariantes: a rota de uso")

## Contexto

O agente da Mensageria precisa responder "quais clínicas têm os Aniversariantes
ligados e nunca enviaram nada, ou não enviam há 30 dias?", com a fonte. A ADR
0008 de lá decidiu que um sistema não lê o banco do outro: cada app expõe uma
rota de leitura com chave. Até aqui, as únicas rotas de máquina deste app eram
os crons, que executam e não devolvem dados.

## Decisão

1. **`GET /api/integracao/uso`**, só leitura, com o mesmo contrato no app de
   Lembretes (`modulo` muda):

   ```json
   { "modulo": "aniversariantes", "geradoEm": "2026-11-05T12:00:00.000Z",
     "clinicas": [ { "companyId": "…", "nome": "…", "ligado": true,
         "setupId": "<id local>", "setupUrl": null,
         "unidades": [ { "id": "…", "nome": "…" } ],
         "envios": { "total": 0,
                     "porSituacao": { "agendado": 0, "processando": 0, "enviado": 0,
                                      "entregue": 0, "lido": 0, "cancelado": 0, "falhou": 0 },
                     "ultimoEnvioEm": null, "ultimos30Dias": 0, "ultimos90Dias": 0 } } ] }
   ```

   `companyId` é o `slug` de `aniversariantes_clinicas` (o `company_id` da
   plataforma), em minúsculas.

2. **A chave:** `Authorization: Bearer <INTEGRACAO_USO_CHAVE>`, uma variável
   nova e só desta rota (não o `CRON_SECRET`), comparada em tempo constante
   (`src/acesso/chave-de-integracao.ts`). Sem a variável, 503
   (`INTEGRACAO_NAO_CONFIGURADA`); chave errada ou ausente, 401
   (`NAO_AUTORIZADO`). A rota fica fora do gate de clínica do `proxy.ts`, como
   `api/cron`.

3. **O que conta como enviado:** `sent`, `delivered` e `read`, o grupo
   "Enviadas" do Histórico. O instante de cada um é o `enviado_em` (gravado pela
   reconciliação desde 2026-10-21); sem ele, o `scheduled_for`; sem ele, o
   `created_at`. `ultimoEnvioEm` é o maior desses instantes, e `ultimos30Dias` e
   `ultimos90Dias` contam os que caem desde agora menos 30 (ou 90) vezes 24 horas.
   Agendado, processando, cancelado e falho entram só em `total` e
   `porSituacao`.

4. **Módulo ligado:** `companyIdsCadastrados`, que já decide pela fonte certa.
   Com o `CADASTRO_UNIFICADO` ligado, as contas com o produto `aniversariantes`
   ligado no cadastro do CRM ([0005](0005-cadastro-comum.md)); desligado, toda
   clínica de `aniversariantes_clinicas`. A clínica da tabela local fora dessas
   contas (o produto foi desligado no CRM) entra com `ligado: false`, para os
   envios antigos dela aparecerem.

5. **Unidades e id local:** da lista do setup (`listarClinicasNoSetup`), as
   unidades que o painel usa; na clínica fora da lista, as da tabela local. Os
   envios somam todas as unidades da clínica.

6. **A fonte: `setupId` e `setupUrl`.** A fonte da resposta é a tela de setup
   da clínica, `/setup/clinicas/<id local>`.
   - `setupId` é esse id local (`null` só sem linha local), em toda clínica, ligada
     ou não: com ele a Mensageria monta o link sozinha.
   - `setupUrl` é `<URL_PUBLICA sem a barra final>/setup/clinicas/<setupId>`. A
     `URL_PUBLICA` é uma variável opcional e não é segredo (em produção,
     `https://aniversariantes.contactia.com.br`). Sem ela, `setupUrl` sai nulo. Também sai nulo na
     clínica desligada, que a tela de setup não abre.
   - A origem não sai do `Host` da requisição, como no link do painel: a
     Mensageria chama pela rede interna da VPS, onde o `Host` é o nome do
     container.

7. **Fatia vertical:** `src/features/resumo-de-uso/`. `resumo.ts` é a regra,
   pura e testada (o instante entra por parâmetro); `dados.ts` lê, só colunas
   sem segredo, e os envios em páginas de 1000 pelo id (keyset), uma consulta por
   página e não por clínica. A rota só confere a chave e responde.

## Consequências

- Uma chave nova no `.env` deste app e no da Mensageria, e a `URL_PUBLICA`
  opcional. Sem a chave a rota responde 503 e nada mais muda.
- A rota lê todos os envios a cada chamada. Com dezenas de clínicas são poucas
  dezenas de páginas no pior caso; se a tabela crescer muito, o caminho é uma
  visão agregada no banco, com migração.
- Com o cadastro ligado, a leitura da lista do setup cria a linha local que
  faltar, como já faz para o setup e os crons. Uma conta com o produto ligado
  que ainda não tem linha local nem entrou na lista (a leitura dela falhou) não
  aparece na resposta; o log do setup diz o motivo.
- Mudar a forma da resposta é mudar este app, o de Lembretes e a Mensageria.
