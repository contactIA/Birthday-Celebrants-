# 0002 — Continuar lendo o banco do Clinic Control, no schema `aniversariantes`

- **Status:** Aceito
- **Data:** 2026-09-15

## Contexto

As tabelas `aniversariantes_*` vivem no projeto Supabase `jggfnfxdtfqeqyvxufgu`,
compartilhado com o Clinic Control e o DashBoard-s. Decisões já tomadas do outro
lado, que este repositório herda:

- [Clinic-Control ADR 0001](https://github.com/g4bs2006/Clinic-Control/blob/main/docs/adr/0001-banco-unico-compartilhado.md)
  — um projeto Supabase, isolamento por schema.
- [Clinic-Control ADR 0006](https://github.com/g4bs2006/Clinic-Control/blob/main/docs/adr/0006-dono-unico-das-migrations.md)
  — a dependência de schema é declarada, **sem mover migration nenhuma**. O repo
  do Aniversariantes é o dono; o Clinic Control é consumidor.
- [Contrato coluna por coluna](https://github.com/g4bs2006/Clinic-Control/blob/main/docs/reference/schema-aniversariantes.md).

Estado verificado no banco em 2026-09-15 (não inferido de documentação):

```
aniversariantes.aniversariantes_clinicas          3 linhas
aniversariantes.aniversariantes_templates         3
aniversariantes.aniversariantes_envios           93
aniversariantes.aniversariantes_pacientes_cache 690
public.automacao_clinicas                        43   ← só isso sobrou em public
```

## Decisão

**Continuar lendo o mesmo banco.** Sem projeto próprio, sem sincronização.

Três consequências diretas para este repositório:

### 1. Nascemos no schema `aniversariantes`

A migração de `public` para schema por app (Clinic-Control#71) **já foi
executada** — confirmado no banco acima. As migrations do repositório antigo
criam tudo em `public.` e nunca foram atualizadas; o move foi runbook manual.

Aqui o schema é `aniversariantes` desde a primeira migration. Toda a maquinaria
transitória do app anterior morre: a env var `ANIVERSARIANTES_DB_SCHEMA`, o
default `public` e o cast `as 'public'` nos tipos existiam **só** para viabilizar
a janela de corte. A janela fechou.

### 2. `slug` se chama `company_id`

O contrato de schema diz textualmente que `slug` **é o `company_id` da Helena**,
vindo de `clinic_integrations.company_id`. Confirmado: as três clínicas em
produção têm UUID, e o `oral-foz` que o README antigo mandava cadastrar não
existe em lugar nenhum.

O nome errado custou caro: leva a crer que o app aceita slug legível, e faz a
validação de UUID no proxy parecer bug quando é o comportamento correto. **A
coluna continua se chamando `slug` no banco** — renomear é breaking change para o
Clinic Control, que faz `upsert` com `onConflict: "slug"`. No código deste
repositório o conceito se chama `companyId`, com a tradução num lugar só.

### 3. Uma tabela é fronteira, três não são

| Tabela | Quem escreve | Onde vive o acesso |
|---|---|---|
| `aniversariantes_clinicas` | **Clinic Control** + nós | `shared/clinica` — acessor único |
| `aniversariantes_templates` | só nós | dentro da fatia |
| `aniversariantes_envios` | só nós | dentro da fatia |
| `aniversariantes_pacientes_cache` | só nós | dentro da fatia |

Isso resolve o custo que [0001](0001-vertical-slice.md) registrou: fatias falam
com o banco direto, mas o acoplamento externo fica num arquivo só.

## O que muda e o que não muda

- **Não abstraímos persistência.** Não dá para trocar o Postgres — o Clinic
  Control lê as mesmas tabelas. Repositório genérico seria cerimônia.
- **Migrations continuam aqui**, por ADR 0006. Alterar coluna de
  `aniversariantes_clinicas` exige PR nos dois repos, e nada neste repositório
  vai acusar sozinho.
- **Teste de contrato:** o ADR 0006 deixou como "opcional, decidir depois". Com
  suíte de testes desde o primeiro commit, fica barato — uma consulta ao
  `information_schema` que falha quando uma coluna do contrato some move a
  descoberta da quebra do runtime em produção para o CI. Decisão: **fazer.**

  *Implementado em 2026-09-23, com dois ajustes:* a lista de colunas mora em
  `src/shared/contrato.ts` e o **compilador** exige que ela bata com os tipos
  de linha de `db.ts`; a conferência contra o banco real roda no `deploy.sh`,
  antes do build — e não no CI, que não tem credencial do banco. Lê as colunas
  pelo OpenAPI do PostgREST em vez do `information_schema`, que não é exposto.
- **Constraint duplicada:** `aniversariantes_clinicas_prontuario_credenciais_check`
  existe no banco e de novo em TypeScript no Clinic Control. Não replicamos uma
  terceira cópia aqui.
- **Credenciais em texto plano:** o Clinic Control cifra o token Helena do lado
  dele (AES-256-GCM) e grava em claro nesta tabela. Assimetria conhecida,
  rastreada em Clinic-Control#28. Não é criada nem resolvida por este ADR.

## Direção de longo prazo

O ADR 0006 do Clinic Control diz que a solução definitiva é **monorepo com um
`packages/db` único**, onde o contrato deixa de ser documento e volta a ser
código verificado pelo compilador. Este repositório nasce em `contactIA`, junto
do DashBoard-s — se a consolidação for por lá, esta decisão é um passo na
direção certa, não contra ela. Vale revisitar quando o Clinic Control se mover.
