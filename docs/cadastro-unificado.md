# Cadastro comum dos produtos

Com a variável `CADASTRO_UNIFICADO` ligada, este app lê a clínica do cadastro comum
que o setup do CRM mantém para os quatro produtos, e não mais de
`aniversariantes_clinicas`. A decisão está no [ADR 0005](adr/0005-cadastro-comum.md);
a do lado do CRM, no
[ADR 0014 de lá](https://github.com/contactIA/CRM-Contact-IA/blob/main/docs/adr/0014-setup-unificado-dos-produtos.md)
(issue [#215](https://github.com/contactIA/CRM-Contact-IA/issues/215)).

## As variáveis

| Variável | Valor |
|---|---|
| `CADASTRO_UNIFICADO` | `1`, `true`, `sim` ou `ligado` liga. Vazia, ausente ou qualquer outro valor: desligada, o app de sempre. |
| `CADASTRO_CHAVE_CIFRAGEM` | A chave que abre os segredos do cadastro: 32 bytes em base64, **a mesma** do `.env` do CRM e do app de Lembretes. Não é a `CRM_CHAVE_CIFRAGEM`. Obrigatória com a leitura ligada; quem preenche é a equipe. |

Mudou o `.env`, rode o `deploy.sh`: o container só lê o `.env` quando é recriado.

## O que o app lê de cada visão

Só o `service_role` lê o esquema `cadastro`, e o app já usa o `service_role`. As
colunas estão em `src/shared/contrato.ts` (`CONTRATO_DO_CADASTRO`), que monta os
`select` e é conferido no deploy.

| Visão | Colunas | Para quê |
|---|---|---|
| `cadastro.produtos` | `clinica_id`, `company_id`, `produto`, `ligado`, `configuracao` | Entra no app a clínica com o produto `aniversariantes` ligado. Da `configuracao`, o `campoNascimento`: o campo do contato que recebe a data de nascimento. |
| `cadastro.clinicas` | `id`, `company_id`, `nome`, `fuso_horario`, `token_plataforma_cifrado` | A clínica pela conta (`company_id`): o nome, o fuso e o token da plataforma, decifrado no servidor. |
| `cadastro.unidades` | `id`, `clinica_id`, `company_id`, `nome`, `principal`, `ativa`, `canal_envio_id`, `canal_envio_numero`, `equipe_envio_id`, `prontuario_sistema`, `prontuario_credenciais_cifradas` | Entram no painel as unidades ativas com prontuário. De cada uma: o prontuário decifrado (e-Clínica: `token` e `baseUrl`; Clinicorp: `usuario`, `token`, `subscriberId` e `baseUrl`), o `from` (`canal_envio_numero`), o canal (`canal_envio_id`) e a equipe (`equipe_envio_id`). |
| `cadastro.unidade_origens` | `unidade_id`, `clinica_id`, `company_id`, `origem`, `id_na_origem` | O id que a unidade tinha neste app, gravado pela importação (origem `aniversariantes`). |

O resto do app recebe a mesma `Clinica` de antes, já no contexto da unidade: os
provedores, as fatias e os crons não mudam.

## O id da unidade

Os modelos, os envios e o cache guardam o id da unidade **deste app**. A regra
(`idLocalDaUnidade`, em `src/shared/clinica/montagem.ts`):

1. A unidade tem origem `aniversariantes` em `cadastro.unidade_origens` e a linha
   `id_na_origem` existe aqui, na mesma clínica: vale esse id. É a unidade que veio
   daqui pela importação, com os modelos e o histórico dela.
2. Senão, vale o id da própria unidade do cadastro (a unidade criada depois, no
   setup do CRM).

A clínica e a unidade que só existem no cadastro ganham, na primeira leitura, uma
linha aqui (a âncora) com esse id, só para as chaves estrangeiras. Nenhum segredo é
copiado para ela. Uma origem que aponta para unidade de outra clínica é ignorada,
com aviso no log (`[cadastro]`).

## A ordem para ligar em produção

O deploy deste código é seguro antes de tudo isso: desligada, a variável não toca
no cadastro. Ligar vem por último:

1. **No CRM:** a migração `0017_cadastro_dos_produtos` aplicada (com o OK da
   equipe).
2. **No Supabase:** expor o esquema `cadastro` no PostgREST (Data API, "Exposed
   schemas"), à mão, como foi com os esquemas dos apps.
3. **No CRM:** a `CADASTRO_CHAVE_CIFRAGEM` no `.env` e os tokens regravados com ela
   (`scripts/recifrar-tokens-do-cadastro.ts --valer`). Antes disso, os tokens do CRM
   só abrem com a chave do CRM.
4. **A importação de partida (#214):** traz as clínicas daqui para o cadastro, liga
   o produto `aniversariantes`, grava o prontuário, o canal de envio e o campo da
   data de nascimento, e registra a origem de **todas** as unidades daqui, inclusive
   a principal. Unidade sem origem perde, no painel, os modelos, os envios e o
   cache dela (que seguem no banco).
5. **Conferir no setup do CRM** cada clínica com o produto ligado: ao menos uma
   unidade ativa com prontuário. Clínica de uma unidade só pode não ter unidade no
   CRM; aí o painel dela não abre ("ainda não tem uma unidade com o prontuário
   configurado").
6. **Aqui:** `CADASTRO_CHAVE_CIFRAGEM` e `CADASTRO_UNIFICADO=1` no `.env`, e o
   `deploy.sh`. Ele para antes de trocar o container se faltar a chave, se o
   esquema não estiver exposto ou sem as colunas, ou se a chave não abrir os
   segredos das clínicas com o produto ligado.
7. **Depois do deploy:** o setup deste app mostra "Cadastro comum dos produtos";
   abrir o painel de uma clínica; o log do primeiro cron
   (`docker logs birthday-celebrants 2>&1 | grep '\[cadastro'`). Unidade nova da
   Clinicorp começa com o cache vazio: "Sincronizar agora" no setup, ou esperar as
   03:00.

**Desligar:** `CADASTRO_UNIFICADO=` vazio e o `deploy.sh`. Volta o que era, com dois
restos: as âncoras criadas (clínicas com as credenciais vazias, que o setup mostra
incompletas) e os modelos e envios feitos nas unidades-âncora, que seguem ligados a
elas.

## O que muda no setup deste app

Com a leitura ligada:

- **A lista** é a das clínicas com os Aniversariantes ligados no CRM, com o aviso de
  onde editar. Some o "Nova clínica"; a página de nova clínica explica que o cadastro
  é no CRM.
- **A clínica abre só para leitura:** o nome, o fuso, a conta, o token (configurado
  ou não), o campo da data de nascimento e, por unidade, o prontuário, o remetente e
  a equipe. As unidades que não entram no painel aparecem com o motivo (inativa ou
  sem prontuário). Credencial que não abre com a chave deste servidor aparece com
  aviso.
- **Continuam aqui:** o teste de conexão (com os dados do cadastro), a sincronização
  da Clinicorp por unidade e o link do painel.
- **Os modelos de mensagem** continuam com a clínica, no painel, sem mudança.
- As rotas que gravavam a clínica e as unidades respondem 409 (`CADASTRO_NO_CRM`).

## As colunas antigas e o Clinic Control

Com a leitura ligada, ficam sem uso:

- em `aniversariantes_clinicas`: `nome`, `timezone`, `sistema_prontuario`, as de
  credencial (`eclinica_*`, `clinicorp_*`), `helena_token`, `helena_from`,
  `helena_channel_id`, `helena_department_id` e `helena_campo_nascimento`. Seguem em
  uso o `id`, o `slug` (a âncora e a conta) e o `created_at`;
- em `aniversariantes_unidades`: `nome`, `principal`, `sistema_prontuario`, as de
  credencial e as de remetente. Segue em uso o `id` (e o `clinica_id`).

O Clinic Control grava hoje em `aniversariantes_clinicas` por `upsert` no `slug`
(`src/lib/clinics/aniversariantes-actions.ts`). Com a leitura ligada, o que ele grava
não chega mais ao painel, e clínica provisionada só por lá não aparece: precisa do
produto ligado no CRM. Se ele para de gravar está em aberto (#211).

**A migração de limpeza fica para depois**, quando a leitura estiver ligada e
estável e o #211 decidido. Até lá as colunas ficam, e são elas que valem se a
variável for desligada.
