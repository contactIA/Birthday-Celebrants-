#!/usr/bin/env bash
# Define (ou troca) a senha da área de setup e redeploya. Um comando só.
#
# Do seu PC:
#   ssh -t -i ~/.ssh/contactia_vps root@179.197.235.183 \
#     'sudo -iu contactia /home/contactia/birthday-celebrants/app/deploy/definir-senha-setup.sh'
#
# O `-t` não é opcional: sem terminal a senha não tem onde ser digitada.
#
# Roda o gerador num container Node descartável (a VPS não tem Node instalado),
# com a pasta do app montada. A senha é digitada no terminal, vira hash dentro
# do container e só o hash é gravado no .env. Trocar a senha derruba toda
# sessão aberta do setup.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERRO: .env não encontrado. Ver docs/deploy-vps.md, passo 3." >&2
  exit 1
fi

docker run --rm -it \
  --user "$(id -u):$(id -g)" \
  --volume "$PWD:/app" \
  --workdir /app \
  node:24-alpine \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/gerar-hash-setup.mjs --gravar .env

echo
echo "==> aplicando: deploy"
./deploy/deploy.sh
