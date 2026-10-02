-- A EQUIPE da plataforma de mensagens que agenda pelo número remetente.
--
-- Na plataforma, todo agendamento pertence a uma equipe (a API a chama de
-- "department"), e a equipe só agenda pelos canais que atende. Sem equipe no
-- pedido, a plataforma usa a equipe padrão da conta — e quando a padrão não
-- atende o número remetente, todo agendamento falha com "Esse canal não esta
-- associado a esse departamento". Foi o caso real que originou esta coluna.
--
-- É o id da equipe (UUID), escolhido no setup junto com o canal, a partir da
-- lista de equipes da conta. Nulo = não informar, e vale a equipe padrão.
--
-- Mora onde o remetente mora: na clínica (a unidade principal lê dali) e nas
-- unidades adicionais. Coluna nova e opcional na tabela compartilhada com o
-- Clinic Control: o upsert de lá não a informa, e colunas não informadas ficam
-- como estão.
--
-- Idempotente.

alter table aniversariantes.aniversariantes_clinicas
  add column if not exists helena_department_id text;

alter table aniversariantes.aniversariantes_unidades
  add column if not exists helena_department_id text;
