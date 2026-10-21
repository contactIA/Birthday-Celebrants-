-- POR QUE a mensagem falhou, como a plataforma de mensagens diz.
--
-- A listagem de mensagens agendadas traz `failureReason` em cada mensagem
-- ("132012 - Os valores de parâmetros variáveis foram formatados
-- incorretamente...", "Modelo de mensagem não encontrado."), e a reconciliação
-- guardava só o status. Em 2026-10-21 a Oral Foz tinha 161 falhas desde agosto,
-- nenhuma entrega, e nada aqui dizia o porquê: o motivo só apareceu consultando
-- a plataforma à mão (o modelo tinha imagem e saía sem o arquivo).
--
-- Preenchido pela reconciliação quando o status vira `failed`; nulo nos outros
-- status e nas falhas de antes desta migração.
--
-- Só este app escreve em aniversariantes_envios (o Clinic Control não), então a
-- coluna nova não muda nada fora daqui. Idempotente.

alter table aniversariantes.aniversariantes_envios
  add column if not exists motivo_da_falha text;
