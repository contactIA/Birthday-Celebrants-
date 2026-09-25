-- Qual campo personalizado do CONTATO, na plataforma de mensagens, guarda a
-- data de nascimento. Ao agendar, o app cria ou completa o contato do
-- paciente (nome e nascimento) antes de criar a mensagem agendada: sem
-- contato salvo, a plataforma mostra o número no lugar do nome.
--
-- É a CHAVE do campo (ex.: "data-de-nascimento"), escolhida no setup a partir
-- da lista de campos de data da conta. Nulo = não preencher nascimento.
--
-- Coluna nova e opcional nesta tabela compartilhada com o Clinic Control: o
-- upsert de lá não a informa, e colunas não informadas ficam como estão.
--
-- Idempotente.

alter table aniversariantes.aniversariantes_clinicas
  add column if not exists helena_campo_nascimento text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'aniversariantes_clinicas_campo_nascimento_check'
  ) then
    alter table aniversariantes.aniversariantes_clinicas
      add constraint aniversariantes_clinicas_campo_nascimento_check
      check (helena_campo_nascimento is null or char_length(helena_campo_nascimento) <= 120);
  end if;
end $$;
