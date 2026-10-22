-- A ficha do envio no Histórico: o que foi enviado, quando cada passo
-- aconteceu e em qual conversa. A mesma migração do app de lembretes.
--
-- `texto`: a mensagem como saiu, montada no agendamento pela MESMA função da
-- prévia (`renderizar`). Sem ela, a ficha teria de remontar a mensagem com o
-- modelo de hoje, e mostraria outra coisa se alguém editou o modelo depois.
-- Nulo nos envios de antes desta migração e quando o modelo ficou fora da
-- listagem da plataforma.
--
-- `conversa_id`: a conversa onde o parabéns foi enviado (`sessionId` da
-- mensagem agendada), para o "Abrir conversa". Vem da reconciliação.
--
-- `enviado_em`, `entregue_em`, `lido_em`, `falhou_em`: a plataforma não guarda o
-- horário de cada passo, só o da última mudança (`updatedAt`, sondado em
-- 2026-10-21). A reconciliação, a cada 15 min, grava esse horário na coluna do
-- status que encontrou. Passo pulado entre duas leituras fica sem horário.
--
-- `cancelado_em`: quando o app cancelou, no Histórico.
--
-- Reagendar por cima da linha zera tudo isto: ela passa a descrever a mensagem
-- nova.
--
-- Só aditiva: o código antigo segue funcionando com ela. Aplicar ANTES do
-- deploy (o contrato confere as colunas). Idempotente.

alter table aniversariantes.aniversariantes_envios
  add column if not exists texto text,
  add column if not exists conversa_id text,
  add column if not exists enviado_em timestamptz,
  add column if not exists entregue_em timestamptz,
  add column if not exists lido_em timestamptz,
  add column if not exists falhou_em timestamptz,
  add column if not exists cancelado_em timestamptz;
