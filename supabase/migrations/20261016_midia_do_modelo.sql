-- A MÍDIA de cada modelo (vídeo, imagem, documento).
--
-- Modelo com mídia no cabeçalho só sai com o arquivo junto: agendado sem ele,
-- a plataforma aceita e o WhatsApp recusa no disparo (132012). E a API pública
-- não entrega o arquivo do modelo — só diz que ele tem mídia. Por isso a clínica
-- envia o arquivo na tela de Modelos; o app o sobe na plataforma e guarda aqui o
-- id que ela devolve, que vai junto em cada agendamento do modelo.
--
-- `arquivo_id`: o id do arquivo na plataforma. Nulo = nenhuma mídia enviada.
-- `arquivo_nome`: o nome do arquivo, para a tela dizer qual é.
--
-- Só este app escreve em aniversariantes_templates (o Clinic Control não), então
-- as colunas novas não mudam nada fora daqui. Idempotente.

alter table aniversariantes.aniversariantes_templates
  add column if not exists arquivo_id text,
  add column if not exists arquivo_nome text;
