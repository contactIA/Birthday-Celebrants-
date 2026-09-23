# Schema `aniversariantes`

## Quem é dono do quê

Este repositório **versiona** o schema `aniversariantes`. O Clinic Control
**consome** — e não só lê: `provisionAniversariantes()` faz `upsert` em
`aniversariantes_clinicas` com `onConflict: "slug"`.

| Tabela | Quem escreve |
|---|---|
| `aniversariantes_clinicas` | Clinic Control **+** este app |
| `aniversariantes_templates` | só este app |
| `aniversariantes_envios` | só este app |
| `aniversariantes_pacientes_cache` | só este app |

Alterar coluna de `aniversariantes_clinicas` é *breaking change* no Clinic
Control, e **nada neste repositório vai acusar**. Remover coluna, renomear ou
apertar constraint exige PR nos dois repos.

- Contrato coluna por coluna: [Clinic-Control/docs/reference/schema-aniversariantes.md](https://github.com/g4bs2006/Clinic-Control/blob/main/docs/reference/schema-aniversariantes.md)
- Decisão: [Clinic-Control ADR 0006](https://github.com/g4bs2006/Clinic-Control/blob/main/docs/adr/0006-dono-unico-das-migrations.md) · [nosso ADR 0002](../docs/adr/0002-banco-compartilhado.md)

## A baseline

`20260915_baseline.sql` reconstrói o estado real de produção, obtido por
introspecção do banco — não por leitura das migrations antigas, que ficaram
defasadas quando o schema saiu de `public` por runbook manual.

Ela é **idempotente e no-op contra produção**. Existe para que um ambiente
limpo suba sozinho, não para mudar o que está no ar.

Duas coisas que a baseline faz de propósito diferente de produção:

- **Não reproduz os grants vestigiais** de `anon`/`authenticated` no nível de
  tabela, herdados de quando as tabelas viviam em `public`. São inalcançáveis
  (o schema não concede `USAGE` a esses papéis), mas são acidente. Ambiente
  limpo nasce mais restrito, nunca mais frouxo.
- **Preserva a ordem das colunas** de produção, mesmo onde ela é feia
  (`created_at` no meio da tabela de clínicas). Reordenar faria um clone limpo
  divergir do banco real sem ganho.

## Convenção

`AAAAMMDD_nome.sql`, a mesma do repositório anterior e a registrada no runbook
de migração de schemas do Clinic Control. A série do Clinic Control usa `00NN_`
e vive em outro schema — as duas não competem nem precisam de ordem relativa.

## Depois de aplicar num projeto novo

Um passo que não está em repositório nenhum e é o mais fácil de esquecer:
**expor o schema no PostgREST** (Dashboard → Settings → API → Exposed schemas).
Sem isso toda chamada responde `PGRST106`, e o erro não diz o que falta.

## Teste de contrato

As colunas de que o código depende estão em `src/shared/contrato.ts`, e o
compilador exige que batam com os tipos de linha de `src/shared/db.ts`. O
`deploy.sh` confere a lista contra o banco real antes de cada build
(`scripts/verificar-contrato.mjs`): se o Clinic Control remover ou renomear uma
coluna, o deploy para com a lista do que falta.

**Mudou uma coluna?** Migration aqui, tipo em `db.ts`, lista em `contrato.ts` —
e PR no Clinic Control se for `aniversariantes_clinicas`.
