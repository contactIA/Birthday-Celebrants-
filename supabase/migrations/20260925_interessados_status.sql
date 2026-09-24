-- Etapa do pedido de vaga, para a fila que a clínica vê na página de beta.
--
--   recebido   → acabou de pedir (padrão)
--   em_analise → a equipe marcou no setup que está olhando o pedido
--
-- A terceira etapa, "vaga liberada", NÃO é coluna: é a clínica existir em
-- `aniversariantes_clinicas`. Guardar de novo aqui seria uma segunda fonte
-- da mesma verdade, e as duas divergiriam no primeiro cadastro feito por fora.
--
-- Idempotente.

alter table aniversariantes.aniversariantes_interessados
  add column if not exists status text not null default 'recebido';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'aniversariantes_interessados_status_check'
  ) then
    alter table aniversariantes.aniversariantes_interessados
      add constraint aniversariantes_interessados_status_check
      check (status in ('recebido', 'em_analise'));
  end if;
end $$;
