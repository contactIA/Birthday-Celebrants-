-- Baseline do schema `aniversariantes`.
--
-- POR QUE UMA BASELINE, E NÃO A SÉRIE HISTÓRICA
--
-- No repositório anterior as três migrations criavam tudo em `public.`, e a
-- mudança para um schema dedicado (Clinic-Control#71) foi feita por runbook
-- manual — nunca virou migration. O resultado: `git clone` + migrations
-- produzia um schema que não é o de produção, e nada acusava.
--
-- Este arquivo reconstrói o estado REAL, obtido por introspecção do banco
-- (`information_schema`, `pg_constraint`, `pg_indexes`, `pg_class.relacl`) em
-- 2026-09-15, não por leitura das migrations antigas. Ele consolida:
--
--   20260803_aniversariantes_init.sql
--   20260811_clinicorp.sql
--   20260811_clinicorp_credenciais_check.sql
--   + o move de `public` para `aniversariantes` (runbook #71)
--
-- APLICAR EM PRODUÇÃO É NO-OP. Todo objeto usa `if not exists`, e os `alter`
-- restantes são idempotentes. O objetivo é que um ambiente limpo suba sozinho,
-- não mudar o que já está no ar.
--
-- ATENÇÃO: `aniversariantes_clinicas` tem consumidor EXTERNO. O Clinic Control
-- lê e ESCREVE nela (`upsert` com `onConflict: "slug"`). Alterar coluna aqui é
-- breaking change lá, e nada neste repositório vai acusar.
--   Contrato: Clinic-Control/docs/reference/schema-aniversariantes.md
--   Decisão:  Clinic-Control/docs/adr/0006-dono-unico-das-migrations.md
--   Ver também: docs/adr/0002-banco-compartilhado.md

create schema if not exists aniversariantes;

-- `gen_random_uuid()` é nativo desde o PG13, mas a extensão fica por
-- compatibilidade com o que já está aplicado.
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- aniversariantes_clinicas
-- ---------------------------------------------------------------------------
-- A ordem das colunas parece estranha — `created_at` no meio, as de Clinicorp
-- no fim — e é intencional: reproduz a ordinal position de produção, onde elas
-- entraram por `alter table` depois. Reordenar aqui faria um clone limpo
-- divergir do banco real sem ganho nenhum.
create table if not exists aniversariantes.aniversariantes_clinicas (
  id uuid primary key default gen_random_uuid(),

  -- NÃO é um slug legível. É o `company_id` da plataforma de mensagens, vindo
  -- de `clinic_integrations.company_id` no Clinic Control — um UUID. O nome é
  -- legado e é breaking change renomear (o upsert de lá usa esta coluna como
  -- chave de conflito). No código deste repo o conceito se chama `companyId`.
  slug text unique not null,
  nome text not null,

  eclinica_token text,
  eclinica_base_url text not null default 'https://eclinica.app/api/v2',

  helena_token text not null,
  helena_channel_id text,
  helena_from text,

  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),

  sistema_prontuario text not null default 'eclinica'
    check (sistema_prontuario in ('eclinica', 'clinicorp')),
  clinicorp_usuario_api text,
  clinicorp_token_api text,
  clinicorp_subscriber_id text,
  clinicorp_base_url text not null default 'https://api.clinicorp.com/rest/v1',

  -- `eclinica_token` era NOT NULL na migration original, o que impedia
  -- cadastrar clínica só-Clinicorp. A regra virou condicional ao provedor.
  --
  -- ESTA CONSTRAINT ESTÁ DUPLICADA: `provisionAniversariantes()` no Clinic
  -- Control valida exatamente o mesmo em TypeScript, antes do upsert, para
  -- devolver erro legível. Mudar uma sem a outra faz o app rejeitar o que o
  -- banco aceitaria, ou o contrário.
  constraint aniversariantes_clinicas_prontuario_credenciais_check check (
    (sistema_prontuario = 'eclinica' and eclinica_token is not null)
    or
    (sistema_prontuario = 'clinicorp'
      and clinicorp_usuario_api is not null
      and clinicorp_token_api is not null
      and clinicorp_subscriber_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- aniversariantes_templates
-- ---------------------------------------------------------------------------
create table if not exists aniversariantes.aniversariantes_templates (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null
    references aniversariantes.aniversariantes_clinicas(id) on delete cascade,

  -- Identificador do modelo na plataforma de mensagens. Nome legado, mantido
  -- por fazer parte do contrato de schema.
  helena_template_id text not null,
  nome text not null,

  -- `{"1": "primeiro_nome", "2": "aniversario"}` — de parâmetro do template
  -- para campo do paciente. Resolvido por src/shared/template/parametros.ts.
  param_mapping jsonb not null default '{}'::jsonb,

  -- Antecedência do envio em relação ao aniversário. Aplicada em
  -- src/shared/data/agendamento.ts — no app anterior esta coluna era salva e
  -- nunca lida, então "3 dias antes" enviava no próprio dia.
  dia_envio text not null default 'aniversario'
    check (dia_envio in ('aniversario', '1_dia_antes', '3_dias_antes')),
  horario_envio text not null default '09:00',

  is_default boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (clinica_id, helena_template_id)
);

-- ---------------------------------------------------------------------------
-- aniversariantes_envios
-- ---------------------------------------------------------------------------
create table if not exists aniversariantes.aniversariantes_envios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null
    references aniversariantes.aniversariantes_clinicas(id) on delete cascade,
  template_id uuid
    references aniversariantes.aniversariantes_templates(id) on delete set null,

  -- Nome legado: guarda o id do paciente em QUALQUER prontuário, inclusive
  -- Clinicorp. Renomear é breaking change (ver cabeçalho).
  paciente_id_eclinica text not null,
  paciente_nome text not null,
  paciente_telefone text not null,
  data_nascimento text,
  ano int not null,

  -- Id da mensagem agendada na plataforma. `null` quando a criação respondeu
  -- sem corpo — o cancelamento depende dele.
  scheduled_message_id text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processed', 'sent', 'delivered', 'read', 'canceled', 'failed')),
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),

  -- Um parabéns por paciente por ano. Foi esta chave que expôs o bug do
  -- cálculo antigo, que empurrava aniversário passado para o ano seguinte e
  -- ocupava a linha com um envio fantasma.
  unique (clinica_id, paciente_id_eclinica, ano)
);

-- ---------------------------------------------------------------------------
-- aniversariantes_pacientes_cache
-- ---------------------------------------------------------------------------
-- Existe porque a API da Clinicorp só lista aniversariantes de UM dia. Montar
-- "o mês" ao vivo custaria até 31 requests por carregamento de tela, mais um
-- por paciente para obter o status. Um cron diário preenche isto e a tela lê
-- só daqui. Ver docs/adr/0001-vertical-slice.md sobre a dependência entre a
-- fatia que escreve e o adapter que lê.
create table if not exists aniversariantes.aniversariantes_pacientes_cache (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null
    references aniversariantes.aniversariantes_clinicas(id) on delete cascade,

  paciente_id text not null,
  nome text not null,
  telefone text,
  datanascimento text, -- "YYYY-MM-DD", normalizado no sync
  mes_aniversario int not null check (mes_aniversario between 1 and 12),
  dia_aniversario int not null check (dia_aniversario between 1 and 31),

  -- ACTIVE / INACTIVE / DELETED, obtido em chamada separada por paciente.
  -- `null` = não verificado (a chamada falhou no sync); a tela trata como
  -- informativo e não filtra.
  situacao text,
  synced_at timestamptz not null default now(),

  unique (clinica_id, paciente_id)
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index if not exists idx_aniversariantes_envios_clinica
  on aniversariantes.aniversariantes_envios(clinica_id);

create index if not exists idx_aniversariantes_templates_clinica
  on aniversariantes.aniversariantes_templates(clinica_id);

create index if not exists idx_aniversariantes_pacientes_cache_clinica_mes
  on aniversariantes.aniversariantes_pacientes_cache(clinica_id, mes_aniversario);

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
-- Duas barreiras independentes, e é de propósito:
--
--   1. USAGE no schema só para `service_role`. `anon` e `authenticated` não
--      alcançam o schema, então não alcançam tabela nenhuma dentro dele.
--   2. RLS habilitada SEM policies (deny-all) em todas. Mesmo que alguém
--      conceda USAGE por engano, não há policy que permita linha alguma.
--
-- DIVERGÊNCIA DELIBERADA DE PRODUÇÃO: lá as tabelas ainda carregam grants de
-- `anon` e `authenticated` no nível de TABELA, herdados de quando viviam em
-- `public` (onde o Supabase aplica default privileges). São inalcançáveis, por
-- causa da barreira 1 — mas são acidente, não intenção, e não os reproduzimos.
-- Um ambiente limpo nasce mais restrito que produção, nunca mais frouxo.
grant usage on schema aniversariantes to service_role;

grant select, insert, update, delete
  on all tables in schema aniversariantes to service_role;

alter default privileges in schema aniversariantes
  grant select, insert, update, delete on tables to service_role;

alter table aniversariantes.aniversariantes_clinicas        enable row level security;
alter table aniversariantes.aniversariantes_templates       enable row level security;
alter table aniversariantes.aniversariantes_envios          enable row level security;
alter table aniversariantes.aniversariantes_pacientes_cache enable row level security;

-- Nenhuma seed de clínica aqui: as credenciais são reais e o provisionamento é
-- feito pelo Clinic Control. Um ambiente limpo sobe com o schema vazio, e o
-- app responde "painel ainda não liberado" até existir a primeira linha — que
-- é o comportamento correto, não uma falha.
