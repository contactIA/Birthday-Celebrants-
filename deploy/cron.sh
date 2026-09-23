#!/usr/bin/env bash
# Dispara uma rota de cron do app. Substitui o Vercel Cron.
# Uso: ./deploy/cron.sh sincronizar-clinicorp | reconciliar-status
#
# Roda pelo crontab do usuário `contactia` (ver docs/deploy-vps.md, passo 6).
set -euo pipefail

cd "$(dirname "$0")/.."

HOST=aniversariantes.contactia.com.br
rota="${1:?informe a rota: sincronizar-clinicorp ou reconciliar-status}"

# O segredo vem do mesmo .env do container, para não existir uma segunda cópia
# que possa divergir.
segredo=$(grep -E '^CRON_SECRET=' .env | cut -d= -f2-)
if [ -z "$segredo" ]; then
  echo "$(date -Is) ERRO: CRON_SECRET vazio no .env" >&2
  exit 1
fi

echo "$(date -Is) ==> $rota"

# O header vai por stdin (`-H @-`), não na linha de comando: argumento de
# processo aparece no `ps` de qualquer usuário da máquina.
#
# `--resolve` fala com o nginx local em vez de sair pela internet e voltar, mas
# mantém o nome no SNI — o certificado continua sendo validado.
#
# `-f` transforma 4xx/5xx em falha, para o log acusar: 503 = CRON_SECRET não
# chegou ao container; 401 = valor diferente entre o .env e o container (falta
# rodar o deploy depois de mudar o .env).
printf 'Authorization: Bearer %s\n' "$segredo" | curl -fsS -m 600 \
  --resolve "$HOST:443:127.0.0.1" \
  -H @- \
  "https://$HOST/api/cron/$rota"
echo
