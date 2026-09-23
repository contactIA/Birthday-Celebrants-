# Deploy na VPS (Hostinger + TurboCloud)

O app roda como container Docker numa VPS da Hostinger. O TurboCloud instala o
Docker e o Caddy (HTTPS automático, WAF e rate limit) e faz o build a partir do
`Dockerfile` da raiz. Os crons, que na Vercel vinham do antigo `vercel.json`, aqui são
do crontab do próprio servidor.

## O que o servidor precisa

- **Ubuntu 22.04 limpo** — é o que o TurboCloud suporta. Na Hostinger: hPanel →
  VPS → Sistema operacional → template *Ubuntu 22.04* (sem painel).
- **Portas 22, 80 e 443 livres.** O TurboCloud sobe o próprio Caddy nas 80/443:
  se já houver outro serviço web na VPS (nginx, Traefik, outro painel), os dois
  brigam pela porta.
- Acesso SSH como `root` a partir da máquina de quem faz o deploy.

## 1. DNS

Criar um registro **A** do subdomínio do painel (ex.: `aniversariantes.<domínio>`)
apontando para o IP da VPS. O HTTPS só sai depois que o DNS propagar.

HTTPS não é opcional: o cookie de escopo é `SameSite=None; Secure` porque o
painel roda em iframe (ver `src/proxy.ts`). Em HTTP puro o browser descarta o
cookie e toda navegação dentro do painel responde 401.

## 2. Instalar o TurboCloud no servidor

```bash
ssh root@IP_DA_VPS
curl https://turbocloud.dev/setup | bash -s
```

## 3. Criar o serviço

Em <https://console.turbocloud.dev>: adicionar o servidor, depois um serviço
apontando para o repositório `contactIA/Birthday-Celebrants-`, branch `main`.

- **Porta:** `3000` (a do `Dockerfile`).
- **Domínio:** o subdomínio do passo 1.

Deploy pelo GitHub dá CI/CD: cada push na `main` redeploya.

## 4. Variáveis de ambiente

No console: *Services → o serviço → Environment*. Todas são lidas em **runtime**;
nenhuma precisa existir no build.

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase compartilhado |
| `SUPABASE_SERVICE_ROLE_KEY` | service role do mesmo projeto |
| `LINK_SECRET` | **o mesmo valor do Clinic Control** — senão todo link é recusado |
| `CRON_SECRET` | segredo novo (`openssl rand -hex 32`) |
| `EMBED_HOSTS` | só se o host do white label não for `app.fluxodonto.com` |

`EMBED_HOSTS` tem uma pegadinha: o proxy lê em runtime, mas a CSP
`frame-ancestors` é montada no **build** (`next.config.ts`). Se mudar do default,
passar também como build arg, senão o browser bloqueia o iframe.

## 5. Crons

Os horários herdados da Vercel são UTC; conferir
o fuso do servidor com `timedatectl` e deixar em UTC
(`timedatectl set-timezone UTC`) para manter os mesmos horários — 06:00 UTC é
03:00 em Brasília.

O segredo fica num arquivo só do root, fora do crontab:

```bash
mkdir -p /etc/birthday-celebrants
cat > /etc/birthday-celebrants/cron.env <<'EOF'
APP_URL=https://aniversariantes.SEU_DOMINIO
CRON_SECRET=O_MESMO_VALOR_CADASTRADO_NO_CONSOLE
EOF
chmod 600 /etc/birthday-celebrants/cron.env
```

E o agendamento em `/etc/cron.d/birthday-celebrants`:

```cron
SHELL=/bin/sh
# Sincroniza o cache da Clinicorp; a reconciliação roda depois, sobre ele.
0 6 * * * root . /etc/birthday-celebrants/cron.env && curl -fsS -m 600 -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/sincronizar-clinicorp" >> /var/log/birthday-celebrants-cron.log 2>&1
0 7 * * * root . /etc/birthday-celebrants/cron.env && curl -fsS -m 600 -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/reconciliar-status" >> /var/log/birthday-celebrants-cron.log 2>&1
```

`-f` faz o curl falhar em 4xx/5xx, então o log mostra quando o cron quebrou. Uma
resposta **503** quer dizer `CRON_SECRET` ausente no serviço; **401** quer dizer
valor diferente entre o console e o `cron.env`.

## 6. Verificar

```bash
# Sem token: 401 com texto curto. 503 = LINK_SECRET faltando.
curl -i https://aniversariantes.SEU_DOMINIO/

# Cron manual — deve responder 200 com o relatório por clínica.
. /etc/birthday-celebrants/cron.env
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/sincronizar-clinicorp"
```

Por fim, atualizar no Clinic Control e na configuração da aba da plataforma a
URL base do painel para o novo domínio.
