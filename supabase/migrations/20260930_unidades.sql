-- Unidades: uma clínica (um company_id) com mais de um endereço.
--
-- CADA UNIDADE TEM prontuário próprio (e-Clínica ou Clinicorp), número
-- remetente próprio, pacientes, modelos e envios próprios. A clínica continua
-- dona do que é da CONTA: company_id (`slug`), token da plataforma de mensagens
-- e campo de nascimento do contato.
--
-- COMPATIBILIDADE COM O CLINIC CONTROL. `aniversariantes_clinicas` não perde
-- nem muda coluna. Cada clínica ganha uma unidade PRINCIPAL, e é a linha da
-- clínica que continua guardando as credenciais dela (prontuário + remetente):
-- o upsert do Clinic Control segue valendo, sem cópia para divergir. Por isso
-- as colunas de credencial da unidade principal ficam nulas — o app lê da
-- clínica. Só as unidades ADICIONAIS carregam credenciais próprias.
--
-- Um trigger cria a principal quando o Clinic Control inserir clínica nova.
--
-- JANELA DE DEPLOY. Esta migration troca as chaves únicas de `templates`,
-- `envios` e `pacientes_cache` (passam a incluir a unidade). O código ANTERIOR
-- faz upsert com `onConflict` nas chaves antigas e falha até o deploy novo
-- subir. Aplicar imediatamente antes do deploy.
--
-- Idempotente.

-- ---------------------------------------------------------------------------
-- aniversariantes_unidades
-- ---------------------------------------------------------------------------
create table if not exists aniversariantes.aniversariantes_unidades (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null
    references aniversariantes.aniversariantes_clinicas(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),

  -- Exatamente uma por clínica (índice parcial abaixo). Lê as credenciais da
  -- linha da clínica; as colunas abaixo ficam nulas nela.
  principal boolean not null default false,

  sistema_prontuario text check (sistema_prontuario in ('eclinica', 'clinicorp')),
  eclinica_token text,
  eclinica_base_url text,
  clinicorp_usuario_api text,
  clinicorp_token_api text,
  clinicorp_subscriber_id text,
  clinicorp_base_url text,

  helena_from text,
  helena_channel_id text,

  created_at timestamptz not null default now(),

  -- A mesma regra da clínica (aniversariantes_clinicas_prontuario_credenciais_check),
  -- exigida só das unidades adicionais. A principal herda da clínica.
  constraint aniversariantes_unidades_prontuario_credenciais_check check (
    principal
    or (sistema_prontuario = 'eclinica' and eclinica_token is not null)
    or (sistema_prontuario = 'clinicorp'
      and clinicorp_usuario_api is not null
      and clinicorp_token_api is not null
      and clinicorp_subscriber_id is not null)
  )
);

create unique index if not exists uq_aniversariantes_unidades_principal
  on aniversariantes.aniversariantes_unidades(clinica_id) where principal;

create index if not exists idx_aniversariantes_unidades_clinica
  on aniversariantes.aniversariantes_unidades(clinica_id);

-- A principal de toda clínica que já existe.
insert into aniversariantes.aniversariantes_unidades (clinica_id, nome, principal)
select c.id, c.nome, true
from aniversariantes.aniversariantes_clinicas c
where not exists (
  select 1 from aniversariantes.aniversariantes_unidades u
  where u.clinica_id = c.id and u.principal
);

-- ...e de toda clínica que o Clinic Control (ou o setup) inserir daqui em diante.
create or replace function aniversariantes.criar_unidade_principal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into aniversariantes.aniversariantes_unidades (clinica_id, nome, principal)
  values (new.id, new.nome, true)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_criar_unidade_principal on aniversariantes.aniversariantes_clinicas;
create trigger trg_criar_unidade_principal
  after insert on aniversariantes.aniversariantes_clinicas
  for each row execute function aniversariantes.criar_unidade_principal();

-- ---------------------------------------------------------------------------
-- unidade_id nas tabelas de dados
-- ---------------------------------------------------------------------------
alter table aniversariantes.aniversariantes_templates
  add column if not exists unidade_id uuid
  references aniversariantes.aniversariantes_unidades(id) on delete cascade;
alter table aniversariantes.aniversariantes_envios
  add column if not exists unidade_id uuid
  references aniversariantes.aniversariantes_unidades(id) on delete cascade;
alter table aniversariantes.aniversariantes_pacientes_cache
  add column if not exists unidade_id uuid
  references aniversariantes.aniversariantes_unidades(id) on delete cascade;

update aniversariantes.aniversariantes_templates t set unidade_id = u.id
  from aniversariantes.aniversariantes_unidades u
  where u.clinica_id = t.clinica_id and u.principal and t.unidade_id is null;
update aniversariantes.aniversariantes_envios e set unidade_id = u.id
  from aniversariantes.aniversariantes_unidades u
  where u.clinica_id = e.clinica_id and u.principal and e.unidade_id is null;
update aniversariantes.aniversariantes_pacientes_cache p set unidade_id = u.id
  from aniversariantes.aniversariantes_unidades u
  where u.clinica_id = p.clinica_id and u.principal and p.unidade_id is null;

alter table aniversariantes.aniversariantes_templates alter column unidade_id set not null;
alter table aniversariantes.aniversariantes_envios alter column unidade_id set not null;
alter table aniversariantes.aniversariantes_pacientes_cache alter column unidade_id set not null;

-- Rede de segurança para linha inserida sem unidade (código antigo, script
-- manual): cai na principal em vez de falhar. O código novo sempre informa.
create or replace function aniversariantes.preencher_unidade_principal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unidade_id is null then
    select u.id into new.unidade_id
    from aniversariantes.aniversariantes_unidades u
    where u.clinica_id = new.clinica_id and u.principal;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preencher_unidade on aniversariantes.aniversariantes_templates;
create trigger trg_preencher_unidade before insert on aniversariantes.aniversariantes_templates
  for each row execute function aniversariantes.preencher_unidade_principal();
drop trigger if exists trg_preencher_unidade on aniversariantes.aniversariantes_envios;
create trigger trg_preencher_unidade before insert on aniversariantes.aniversariantes_envios
  for each row execute function aniversariantes.preencher_unidade_principal();
drop trigger if exists trg_preencher_unidade on aniversariantes.aniversariantes_pacientes_cache;
create trigger trg_preencher_unidade before insert on aniversariantes.aniversariantes_pacientes_cache
  for each row execute function aniversariantes.preencher_unidade_principal();

-- ---------------------------------------------------------------------------
-- Chaves únicas: a unidade entra
-- ---------------------------------------------------------------------------
-- O mesmo paciente pode ser atendido em duas unidades e ganhar um parabéns em
-- cada uma; o mesmo modelo da plataforma pode ser configurado em ambas.
alter table aniversariantes.aniversariantes_templates
  drop constraint if exists aniversariantes_templates_clinica_id_helena_template_id_key;
alter table aniversariantes.aniversariantes_envios
  drop constraint if exists aniversariantes_envios_clinica_id_paciente_id_eclinica_ano_key;
alter table aniversariantes.aniversariantes_pacientes_cache
  drop constraint if exists aniversariantes_pacientes_cache_clinica_id_paciente_id_key;

create unique index if not exists uq_templates_unidade_modelo
  on aniversariantes.aniversariantes_templates(unidade_id, helena_template_id);
create unique index if not exists uq_envios_unidade_paciente_ano
  on aniversariantes.aniversariantes_envios(unidade_id, paciente_id_eclinica, ano);
create unique index if not exists uq_cache_unidade_paciente
  on aniversariantes.aniversariantes_pacientes_cache(unidade_id, paciente_id);

create index if not exists idx_aniversariantes_envios_unidade
  on aniversariantes.aniversariantes_envios(unidade_id);
create index if not exists idx_aniversariantes_templates_unidade
  on aniversariantes.aniversariantes_templates(unidade_id);
create index if not exists idx_aniversariantes_pacientes_cache_unidade_mes
  on aniversariantes.aniversariantes_pacientes_cache(unidade_id, mes_aniversario);

-- ---------------------------------------------------------------------------
-- Acesso — as mesmas duas barreiras das demais tabelas (ver a baseline).
-- ---------------------------------------------------------------------------
alter table aniversariantes.aniversariantes_unidades enable row level security;
grant select, insert, update, delete on aniversariantes.aniversariantes_unidades to service_role;
