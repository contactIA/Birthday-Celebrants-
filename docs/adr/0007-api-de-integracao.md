# 0007 — API de integração versionada (`/api/integracao/v1`)

- **Status:** Aceito
- **Data:** 2026-11-06
- **Origem:** o agente da Mensageria (o Pio) usa os nossos sistemas pelo
  catálogo de operações, como já usa a API da plataforma de mensagens e a do
  CRM. Até aqui, deste app ele só lia o resumo de uso
  ([0006](0006-resumo-de-uso-para-a-mensageria.md)). O mesmo desenho do app
  de lembretes (ADR 0008 de lá).

## Contexto

As rotas de `src/app/api` são da tela: autenticam pela sessão da clínica (o
token do proxy) e respondem no formato que cada tela precisa, sem contrato
escrito. Um agente precisa do contrário: uma chave de máquina, a clínica
explícita, e um contrato que diga o que cada operação faz, o que recebe e o que
devolve, com descrições que ele consiga ler.

## Decisão

1. **Uma API versionada em `/api/integracao/v1`**, montada como um app
   [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi)
   num catch-all do Next (`src/app/api/integracao/v1/[[...rota]]/route.ts`).
   O código mora em `src/integracao/v1`: só traduz HTTP, como `src/app/api`.
   - **Por que Hono e zod:** o mesmo desenho do CRM (`src/api` de lá), que a
     equipe já conhece e que já roda neste Next 16. O esquema zod de cada rota
     valida a entrada e gera o OpenAPI, então o contrato não fica
     desatualizado. O Next não tem roteador próprio para isso; escrever o
     OpenAPI à mão a partir do `z.toJSONSchema` repetiria o que a biblioteca
     faz.
   - **A saída também passa pelo esquema** (`Esquema.parse` antes do `c.json`):
     campo fora do contrato não sai, e resposta com forma errada vira 500 com o
     detalhe no log.
   - **O contrato:** `GET /api/integracao/v1/openapi.json`, OpenAPI 3.1, sem
     chave (não tem dado). Toda rota tem resumo e descrição em português: é por
     elas que o agente escolhe a operação.
   - Mudança que quebra quem integra ganha `/v2`.

2. **A chave: `INTEGRACAO_API_CHAVE_HASH`, nova, e só o SHA-256 dela no `.env`.**
   `Authorization: Bearer <chave>`, comparada em tempo constante contra o hash
   (`conferirChavePeloHash`, `src/acesso/chave-de-integracao.ts`). Sem a
   variável (ou fora do formato de 64 caracteres hexadecimais), 503
   `INTEGRACAO_NAO_CONFIGURADA`; chave errada ou ausente, 401 `NAO_AUTORIZADO`.
   Não reaproveitei a `INTEGRACAO_USO_CHAVE`, de propósito:
   - a de uso só lê números agregados; esta lê nome, telefone e data de
     nascimento de paciente e escreve. Quem tem a de uso não pode ganhar isso, e
     trocar uma não pode derrubar a outra;
   - guardando só o hash, quem lê o `.env` deste app não ganha o acesso (a
     chave mesmo fica no `.env` da Mensageria), como a
     `MENSAGERIA_SETUP_CHAVE_HASH` do CRM.

   A rota de uso continua como está ([0006](0006-resumo-de-uso-para-a-mensageria.md)).

3. **Escopo por clínica, no caminho.** A chave diz QUEM chama, não a clínica.
   Toda operação é `/clinicas/{companyId}/...` e resolve a clínica uma vez
   (`src/integracao/v1/escopo.ts`), pelo mesmo `buscarClinica` da tela; todo
   serviço recebe essa `Clinica`, que filtra cada consulta por `clinica_id` e
   `unidade_id`. A unidade vem em `?unidade=<id>` (sem ele, a principal). Na
   tela a unidade inválida cai na principal em silêncio (é preferência em
   cookie); aqui ela é 404 `UNIDADE_NAO_ENCONTRADA`, e o envio de outra
   clínica ou unidade é 404 `ENVIO_NAO_ENCONTRADO`. Clínica sem o módulo
   ligado: 404 `CLINICA_NAO_PROVISIONADA`. A rota fica fora do gate do
   `proxy.ts` (o matcher já exclui `api/integracao`).

4. **Os mesmos serviços da tela, sem regra nova.** O que as rotas da tela
   montavam à mão virou um `servico.ts` em cada fatia, que a tela e a API
   chamam: `configurar-modelo/servico.ts`, `listar-aniversariantes/servico.ts`
   e `cancelar-envio/servico.ts`. Os filtros do histórico passam pela mesma
   `lerFiltros` da tela.

   Duas extensões pequenas, que a tela não usa ainda:
   - o histórico ganhou **período** (`de`, `ate`) pela data do envio, em dias
     de calendário da clínica, de meia-noite a meia-noite no fuso dela
     (`limitesDoPeriodo`, testada); e cada item diz se **não saiu**;
   - o resumo de uso aceita **uma clínica só** (lê só os envios dela).

5. **Erros no formato `{ erro, codigo }`**, com `detalhes` (campo e motivo)
   quando a requisição não passa na validação. Os textos não citam o
   fornecedor da plataforma de mensagens nem usam travessão (o teste do
   contrato confere).

## O que entrou

| Método | Caminho (`/api/integracao/v1/...`) | O que faz |
|---|---|---|
| GET | `openapi.json` | O contrato, sem chave |
| GET | `clinicas/{companyId}` | A clínica e as unidades |
| GET | `clinicas/{companyId}/uso` | O resumo de uso só da clínica |
| GET | `clinicas/{companyId}/modelos` | Os modelos aprovados na plataforma, com a configuração de cada um (o dia e a hora do parabéns, e qual está em uso) |
| PUT | `clinicas/{companyId}/modelos/{modeloId}` | Salva a configuração de um modelo e o põe (ou não) em uso |
| GET | `clinicas/{companyId}/aniversariantes` | Os aniversariantes do mês, com o parabéns de cada um |
| GET | `clinicas/{companyId}/envios` | O histórico, com situação (inclusive "não saíram"), período e busca |
| GET | `clinicas/{companyId}/envios/proximos` | Os próximos parabéns a sair |
| GET | `clinicas/{companyId}/envios/{envioId}` | A ficha de um envio |
| POST | `clinicas/{companyId}/envios/{envioId}/cancelar` | Cancela um parabéns agendado |

A configuração da unidade, aqui, é o modelo em uso com o dia e a hora do
envio: não há tela de Configurações à parte, e por isso não há rota de
configuração além dos modelos.

As escritas são as que a tela já tem e que fazem sentido para um agente com a
confirmação de uma pessoa: a descrição de cada uma pede essa confirmação, e a
confirmação mesma é do lado da Mensageria (o agente propõe, a pessoa aprova).

## O que ficou de fora, e por quê

- **Agendar os parabéns (o `POST /api/agendamentos` da tela).** Manda mensagem
  para pacientes em lote. Fica com a recepção na tela; se for para o agente,
  entra numa versão própria.
- **Enviar o arquivo do modelo** (multipart). Salvar um modelo pela API
  mantém o arquivo que a tela enviou.
- **O id da conversa** (`/api/historico/{id}/conversa`). Serve para abrir a
  conversa dentro da plataforma; a Mensageria tem o acesso dela às conversas.
- **Criar modelo de mensagem.** Os modelos se criam e se aprovam na plataforma
  de mensagens; a tela também não cria.
- **Ligar ou desligar o módulo da clínica.** Isso é do cadastro do CRM.
- **A lista de interesse, o setup, os crons e a unidade em cookie**: são da
  equipe, das rotinas e da tela.

## Consequências

- Uma variável nova no `.env` deste app (`INTEGRACAO_API_CHAVE_HASH`) e a chave
  no da Mensageria. Sem ela, a API responde 503 e nada mais muda.
- Três dependências novas: `hono`, `@hono/zod-openapi` e `zod` (que já vinha
  como dependência indireta).
- Os testes da API (`src/integracao/v1/app.test.ts`) passam por toda operação
  do contrato: a chave, a clínica do caminho chegando ao serviço, a unidade e o
  envio de outra clínica, a validação da entrada e a da saída.
