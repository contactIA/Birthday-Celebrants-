# Deploy na VPS Hostinger

O app roda como container Docker na VPS `179.197.235.183`, a mesma do Clinic
Control e da stack `contactia` (ligações). O desenho é o do Clinic Control:

- o container **não publica porta**; entra na rede `contactia_default`;
- quem atende 80/443 é o nginx da stack `contactia`, que faz proxy para
  `birthday-celebrants:3000`;
- o certificado é do Let's Encrypt, emitido pelo certbot da stack `contactia`
  nos volumes dela, e renovado pelo cron mensal que já existe;
- os crons do app, que na Vercel vinham do antigo `vercel.json`, são do crontab
  do usuário `contactia`.

**Não instalar TurboCloud, Caddy ou outro proxy nesta VPS.** O nginx da stack
`contactia` já ocupa 80/443, e o instalador do TurboCloud reinicia o Docker —
derrubaria ligações, Clinic Control e Postgres.

Tudo abaixo roda na VPS como usuário `contactia` (`sudo -iu contactia`), salvo
onde indicado.

## 1. DNS

Registro **A** `aniversariantes.contactia.com.br` → `179.197.235.183`, TTL 300.
O DNS do `contactia.com.br` fica na hospedagem do site (nameservers
`ns1/ns2.brasil126-5173.com.br`), não na Hostinger.

HTTPS não é opcional: o cookie de escopo é `SameSite=None; Secure` porque o
painel roda em iframe (ver `src/proxy.ts`). Em HTTP puro o browser descarta o
cookie e toda navegação dentro do painel responde 401.

## 2. Código

O repositório é público, então clona por HTTPS sem chave. Se ficar privado,
cadastrar uma deploy key e um `Host` em `~/.ssh/config`, como o Clinic Control
faz com `github-cliniccontrol`.

```bash
mkdir -p ~/birthday-celebrants && cd ~/birthday-celebrants
git clone https://github.com/contactIA/Birthday-Celebrants-.git app
```

## 3. `.env`

```bash
cd ~/birthday-celebrants/app
cp .env.example .env
chmod 600 .env
nano .env
```

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase compartilhado |
| `SUPABASE_SERVICE_ROLE_KEY` | service role do mesmo projeto |
| `LINK_SECRET` | **o mesmo valor do Clinic Control** — senão todo link é recusado |
| `CRON_SECRET` | segredo novo: `openssl rand -hex 32` |
| `EMBED_HOSTS` | deixar vazio se o host do white label for `app.fluxodonto.com` |

`EMBED_HOSTS` entra também no build, porque a CSP `frame-ancestors` é montada
ali (`next.config.ts`). Mudou o valor → rodar o deploy de novo, não só reiniciar.

## 4. Subir o container

```bash
cd ~/birthday-celebrants/app
./deploy/deploy.sh
```

O script confere o `.env`, builda, troca o container e só termina com
`OK — app saudável` quando `/` responde 401 (app no ar e com `LINK_SECRET`). O
primeiro build leva alguns minutos.

## 5. nginx e certificado

A ordem importa: o nginx recusa recarregar com um `ssl_certificate` que ainda não
existe, e um reload recusado não derruba nada, mas também não aplica nada.

**5a. Bloco provisório, só HTTP** — para o Let's Encrypt validar o domínio:

```bash
cp ~/birthday-celebrants/app/deploy/nginx/aniversariantes-bootstrap.conf \
   ~/contactia/app/deploy/nginx/conf.d/aniversariantes.conf
cd ~/contactia/app
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
```

**5b. Emitir o certificado**, em lineage própria, nos volumes da stack
`contactia` (mesmo comando usado para o Clinic Control):

```bash
docker run --rm \
  -v contactia_certbot-www:/var/www/certbot \
  -v contactia_certbot-conf:/etc/letsencrypt \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  --cert-name aniversariantes.contactia.com.br \
  -d aniversariantes.contactia.com.br \
  --email gabriel.rodrigues@escalarodonto.com.br \
  --agree-tos --no-eff-email --non-interactive
```

**5c. Bloco definitivo, HTTPS:**

```bash
cp ~/birthday-celebrants/app/deploy/nginx/aniversariantes.conf \
   ~/contactia/app/deploy/nginx/conf.d/aniversariantes.conf
cd ~/contactia/app
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
```

**Renovação:** nada a fazer. O cron mensal do usuário `contactia`
(`renovar-certificado.sh`) roda `certbot renew` para todas as lineages do volume.

## 6. Crons

Horários em UTC, e a VPS já está em UTC. 06:00 UTC é 03:00 em Brasília.

- **Sincronização da Clinicorp:** 1x/dia, de madrugada. Faz ~61 chamadas por
  clínica, contra uma cota de 500/hora por usuário de API.
- **Reconciliação de status:** a cada 15 min. Traz "enviada/entregue/lida"
  de volta da plataforma. Só consulta a plataforma quando há envio com
  horário vencido e sem status final, então as execuções sem nada pendente
  não custam chamada nenhuma. Uma vez por dia (o horário original, herdado da
  Vercel) deixava mensagem entregue aparecendo como "Agendado" até a
  madrugada seguinte.

```bash
crontab -e
```

Acrescentar, sem mexer nas linhas que já existem:

```cron
# Birthday Celebrants — sincroniza o cache da Clinicorp; reconcilia status a cada 15 min.
0 6 * * * /home/contactia/birthday-celebrants/app/deploy/cron.sh sincronizar-clinicorp >> /home/contactia/birthday-celebrants/cron.log 2>&1
*/15 * * * * /home/contactia/birthday-celebrants/app/deploy/cron.sh reconciliar-status >> /home/contactia/birthday-celebrants/cron.log 2>&1
```

`deploy/cron.sh` lê o `CRON_SECRET` do mesmo `.env` do container e fala com o
nginx local. No log, **503** = `CRON_SECRET` não chegou ao container; **401** =
o `.env` mudou e o deploy não foi rodado depois.

## 7. Verificar

```bash
# Sem token: 401 com texto curto. 503 = LINK_SECRET faltando.
curl -i https://aniversariantes.contactia.com.br/

# CSP: tem que listar o host do white label.
curl -sI https://aniversariantes.contactia.com.br/ | grep -i content-security

# Cron manual — 200 com o relatório por clínica.
~/birthday-celebrants/app/deploy/cron.sh sincronizar-clinicorp
```

Por fim, trocar a URL base do painel no Clinic Control e na configuração da aba
da plataforma para `https://aniversariantes.contactia.com.br`.

## 8. Área de setup

`https://aniversariantes.contactia.com.br/setup` — onde a equipe cadastra
clínicas, troca credenciais, testa conexão e gera o link do painel. Decisão em
[ADR 0003](adr/0003-area-de-setup.md).

**Na sua máquina**, na pasta do projeto (a senha é digitada no terminal e não
sai dela):

```bash
npm run setup:senha
```

Use no mínimo 14 caracteres. O comando imprime `SETUP_PASSWORD_HASH=scrypt.…`.

**Na VPS**, como `contactia`: acrescentar essa linha ao `.env` e redeployar
(`./deploy/deploy.sh`). Sem ela, `/setup` responde 503 e o painel das clínicas
segue funcionando.

Trocar a senha = gerar outro hash, substituir no `.env` e redeployar. Toda
sessão aberta cai.

O log registra login, cadastros e alterações — nomes dos campos, nunca valores:

```bash
docker logs birthday-celebrants 2>&1 | grep '\[setup'
```

## 9. Rotação do log dos crons

Como root, uma vez:

```bash
cp /home/contactia/birthday-celebrants/app/deploy/logrotate/birthday-celebrants /etc/logrotate.d/
logrotate --debug /etc/logrotate.d/birthday-celebrants
```

## Deploys seguintes

```bash
cd ~/birthday-celebrants/app && ./deploy/deploy.sh
```

Antes do build, o script confere o **contrato de schema** contra o banco real
(`scripts/verificar-contrato.mjs`, lista em `src/shared/contrato.ts`). Se faltar
coluna de que o código depende — removida ou renomeada, por exemplo pelo Clinic
Control —, o deploy para com a lista do que falta, e o container no ar não é
trocado.
