# Decisões de arquitetura

Registro curto do que foi decidido e por quê. Um ADR só é escrito quando a
decisão é cara de reverter ou quando alguém vai questioná-la depois.

| # | Decisão | Status |
|---|---|---|
| [0001](0001-vertical-slice.md) | Vertical Slice em vez de camadas | Aceito |
| [0002](0002-banco-compartilhado.md) | Banco do Clinic Control, schema `aniversariantes` | Aceito |

Decisões herdadas, que vivem no repositório vizinho e continuam valendo aqui:

- [Clinic-Control 0001](https://github.com/g4bs2006/Clinic-Control/blob/main/docs/adr/0001-banco-unico-compartilhado.md) — um projeto Supabase, isolamento por schema
- [Clinic-Control 0003](https://github.com/g4bs2006/Clinic-Control/blob/main/docs/adr/0003-sem-painel-para-cliente-final.md) — por que o pessoal da clínica não recebe sessão do Clinic Control
- [Clinic-Control 0006](https://github.com/g4bs2006/Clinic-Control/blob/main/docs/adr/0006-dono-unico-das-migrations.md) — este repo é dono das migrations `aniversariantes_*`
