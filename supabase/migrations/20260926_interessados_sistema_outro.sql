-- Nome do prontuário quando a clínica marca "Outro" no pedido de vaga.
-- Obrigatório nesse caso (a regra fica em features/entrar-na-lista/regras.ts);
-- nulo para Clinicorp e e-Clínica. O teto de tamanho repete o do formulário.
--
-- Idempotente.

alter table aniversariantes.aniversariantes_interessados
  add column if not exists sistema_outro text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'aniversariantes_interessados_sistema_outro_check'
  ) then
    alter table aniversariantes.aniversariantes_interessados
      add constraint aniversariantes_interessados_sistema_outro_check
      check (sistema_outro is null or char_length(sistema_outro) <= 80);
  end if;
end $$;
