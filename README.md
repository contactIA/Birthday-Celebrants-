# Birthday Celebrants — painel de aniversariantes

Painel onde a clínica vê os aniversariantes do mês e agenda o parabéns pelo
WhatsApp, com modelos aprovados na plataforma de mensagens. Roda dentro de uma
aba da plataforma (white label) e em `https://aniversariantes.contactia.com.br`.

Reconstrução do antigo `g4bs2006/Aniversariantes` — o porquê da reescrita está
em [ADR 0001](docs/adr/0001-vertical-slice.md).

## O que tem

| Área | Quem usa | Onde |
|---|---|---|
| **Agenda** | clínica | `/` — aniversariantes do mês, seleção e agendamento |
| **Modelos** | clínica | `/modelos` — liga as variáveis do modelo aos dados do paciente, dia e horário |
| **Histórico** | clínica | `/historico` — cada envio e seu status, com cancelamento |
| **Setup** | equipe ContactIA | `/setup` — cadastro de clínicas, credenciais, teste de conexão, link do painel, sincronização manual |

Regras que valem saber de cor:

- O aniversário **de hoje não é agendável** — o parabéns precisa de
  antecedência. Em dezembro, os aniversários de janeiro são do ano seguinte.
- **e-Clínica** é consultada ao vivo. **Clinicorp** é lida de um cache,
  renovado todo dia às 03:00 (Brasília) ou pelo botão "Sincronizar agora" do
  setup — a API deles só lista um dia por vez e limita 500 chamadas/hora por
  usuário de API.
- O status dos envios (enviada, entregue, lida, falhou) volta da plataforma a
  cada 15 minutos.
- A plataforma de mensagens é white label: nenhum texto que chega à tela da
  clínica cita o fornecedor.

## Acesso

O painel **não tem login**. A clínica entra por:

- **Aba da plataforma:** `https://aniversariantes.contactia.com.br/?clinica={idaccount}` —
  só funciona aberta de dentro de `app.fluxodonto.com` (o id não é assinado; a
  origem é conferida).
- **Link assinado:** gerado no setup (`/?t=…`), com validade escolhida.

A área de setup tem senha própria da equipe ([ADR 0003](docs/adr/0003-area-de-setup.md)).
O desenho do acesso e os incidentes que o moldaram estão em `src/acesso/`.

## Stack

Next.js 16 (App Router, `proxy.ts`), React 19, Tailwind 4, Supabase (schema
`aniversariantes`, compartilhado com o Clinic Control — [ADR 0002](docs/adr/0002-banco-compartilhado.md)),
Vitest. Produção: container Docker numa VPS Hostinger, atrás do nginx da stack
`contactia`.

## Estrutura

Vertical Slice — leia o [ADR 0001](docs/adr/0001-vertical-slice.md) antes de
mexer. Em uma linha: regra de negócio não mora em handler HTTP, e `src/shared` é
função pura.

```
src/
  app/          rotas (páginas e API) — só traduzem HTTP para as fatias
  features/     um diretório por caso de uso (regra + acesso a dados)
  shared/       kernel puro: datas/fuso, telefone, templates, contrato de schema
  providers/    as duas portas que variam: prontuário e mensageria
  acesso/       proxy, tokens, sessão do setup
  ui/           componentes das telas
deploy/         compose, deploy.sh, nginx, crons, logrotate
docs/           ADRs e o runbook de deploy
supabase/       migrations (este repo é dono do schema)
```

## Desenvolvimento

Node 24 (`.nvmrc`).

```bash
npm ci
cp .env.example .env.local   # preencher — cada variável está documentada ali
npm run dev
```

| Comando | O quê |
|---|---|
| `npm test` | testes (Vitest) — o kernel roda sem banco nem rede |
| `npx tsc --noEmit` | tipos, inclusive o contrato de schema (`src/shared/contrato.ts`) |
| `npm run lint` | ESLint |
| `npm run build` | build de produção (roda sem nenhuma variável de ambiente) |
| `npm run setup:senha` | gera o hash da senha da área de setup |

O CI (`.github/workflows/ci.yml`) roda tipos, lint, testes e build em todo PR.

## Deploy e operação

Tudo em [docs/deploy-vps.md](docs/deploy-vps.md). Resumo:

```bash
# na VPS, como contactia
cd ~/birthday-celebrants/app && ./deploy/deploy.sh
```

O `deploy.sh` confere o `.env`, puxa o código, **verifica o contrato de schema
contra o banco real** (para se faltar coluna), builda e só termina quando o app
responde. Logs:

```bash
docker logs birthday-celebrants 2>&1 | tail -100     # app
tail -50 ~/birthday-celebrants/cron.log              # crons
docker logs birthday-celebrants 2>&1 | grep '\[setup' # ações da área de setup
```
