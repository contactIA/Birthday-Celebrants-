-- Interessados no beta do app de Aniversariantes.
--
-- Quem abre a aba sem ter a clínica cadastrada vê uma página de beta em vez
-- de "painel não liberado", e pode deixar os dados da clínica. Cada pedido
-- chega aqui e aparece na área de setup ("Interessados"), de onde a equipe
-- cadastra a clínica com um clique.
--
-- UM pedido por conta da plataforma: `company_id` é único e o formulário faz
-- upsert — reenviar atualiza o pedido em vez de duplicar. O `company_id` vem do
-- escopo de acesso verificado pelo proxy (a aba da plataforma o informa), nunca
-- do corpo do formulário.
--
-- Tabela só deste app (o Clinic Control não a lê). Nome da coluna já é
-- `company_id`, sem o legado `slug` de `aniversariantes_clinicas`.
--
-- Idempotente: aplicar de novo é no-op.

create table if not exists aniversariantes.aniversariantes_interessados (
  id uuid primary key default gen_random_uuid(),
  company_id text unique not null,
  nome_clinica text not null,
  telefone text not null,
  sistema_prontuario text not null
    check (sistema_prontuario in ('clinicorp', 'eclinica', 'outro')),
  modelo_mensagem text not null,
  -- Consentimento para a equipe entrar em contato (LGPD). O formulário só
  -- envia com a caixa marcada; o registro guarda quando foi dado.
  consentimento_em timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mesmas barreiras da baseline: USAGE do schema só para service_role (já
-- concedido lá) e RLS sem policies.
grant select, insert, update, delete
  on aniversariantes.aniversariantes_interessados to service_role;

alter table aniversariantes.aniversariantes_interessados enable row level security;
