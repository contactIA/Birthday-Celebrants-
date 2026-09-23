#!/usr/bin/env bash
# Deploy na VPS: puxa o Git, rebuilda a imagem e troca o container.
# Uso: cd ~/birthday-celebrants/app && ./deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERRO: .env não encontrado na raiz. Ver docs/deploy-vps.md, passo 3." >&2
  exit 1
fi

# Falha ANTES do build quando falta variável. Sem isto o container sobe, o proxy
# responde 503 em tudo e o motivo só aparece no log.
faltando=()
for v in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY LINK_SECRET CRON_SECRET; do
  grep -Eq "^${v}=.+" .env || faltando+=("$v")
done
if [ ${#faltando[@]} -gt 0 ]; then
  echo "ERRO: variáveis vazias ou ausentes no .env: ${faltando[*]}" >&2
  exit 1
fi

# Carrega o .env no shell para o compose interpolar o build arg EMBED_HOSTS
# (env_file só alimenta o runtime, não a interpolação).
set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "==> git pull"
git pull --ff-only

echo "==> build + troca do container"
docker compose up -d --build app

echo "==> limpando imagens órfãs"
docker image prune -f

echo "==> aguardando o app responder"
for _ in $(seq 1 45); do
  # Sem token, `/` responde 401 — é o sinal de app no ar E com LINK_SECRET.
  # 503 seria o proxy avisando que o segredo não chegou ao container.
  #
  # `< /dev/null` não é decorativo: `docker compose exec -T` lê stdin e, se o
  # script vier por pipe ou heredoc, engole o resto dele sem erro nenhum.
  status=$(docker compose exec -T app node -e \
      "fetch('http://127.0.0.1:3000/').then(r=>console.log(r.status)).catch(()=>console.log(0))" \
      < /dev/null 2>/dev/null || echo 0)
  if [ "$status" = "401" ]; then
    echo "OK — app saudável"
    docker compose ps
    exit 0
  fi
  if [ "$status" = "503" ]; then
    echo "FALHOU — o app respondeu 503: LINK_SECRET não chegou ao container." >&2
    exit 1
  fi
  sleep 2
done

echo "FALHOU — o app não respondeu. Últimos logs:" >&2
docker compose logs --tail=60 app >&2
exit 1
