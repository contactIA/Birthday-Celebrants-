-- O NÚMERO por onde cada mensagem foi agendada.
--
-- Até aqui toda mensagem de uma unidade saía pelo mesmo número (o remetente da
-- unidade), e o histórico mostrava esse número para todas as linhas. Desde
-- 2026-10-10 a mensagem sai pelo número do MODELO escolhido, que pode ser outro
-- número da conta: o histórico precisa do número de cada envio.
--
-- Dígitos com país ("5571981270357"). Nulo nos envios de antes: o histórico
-- mostra o remetente atual da unidade, como sempre mostrou.
--
-- Só este app escreve em aniversariantes_envios (o Clinic Control não), então a
-- coluna nova não muda nada fora daqui. Idempotente.

alter table aniversariantes.aniversariantes_envios
  add column if not exists remetente text;
