-- Marca se a clínica quer enviar o parabéns com foto/vídeo, não só texto.
-- Checkbox opcional no pedido de vaga: não bloqueia o envio do formulário.
--
-- Idempotente.

alter table aniversariantes.aniversariantes_interessados
  add column if not exists quer_midia boolean not null default false;
