# 0003 — Área de setup própria, com senha da equipe

- **Status:** Aceito
- **Data:** 2026-09-23

## Contexto

O cadastro das clínicas — company_id, sistema de prontuário e credenciais de
prontuário e da plataforma de mensagens — era feito só pelo Clinic Control, que
grava na mesma tabela (`aniversariantes_clinicas`, ver [0002](0002-banco-compartilhado.md)).

Isso amarra a operação deste app à disponibilidade de outro: com o Clinic Control
fora do ar, não há como cadastrar clínica nova nem consertar um token vencido.

Este app **não tem login**. O acesso ao painel é por link assinado ou pela aba da
plataforma, e o caminho do white label aceita a clínica pela URL sem assinatura
(protegido só por Referer, ver `src/acesso/decisao.ts`). Um formulário de
credenciais atrás desse acesso deixaria qualquer pessoa com o id de uma clínica
trocar o token da plataforma de mensagens dela.

## Alternativas consideradas

| Opção | Por que não |
|---|---|
| **Só o Clinic Control** | O problema que motivou tudo: depende de outro app estar no ar. |
| **Formulário no acesso do painel** | Sem login, qualquer um com a aba — ou o id de uma clínica e um Referer forjado — trocaria credenciais. |
| **Contas da equipe do Clinic Control** (`clinic_control.app_users`, bcrypt) | Funcionaria com o app deles fora do ar (a tabela está no mesmo banco), mas cria contrato novo com o schema de outro projeto. Descartado pela equipe: a área de setup deve ser independente do Clinic Control. |

## Decisão

**Área `/setup` com senha própria da equipe**, separada do painel das clínicas:

- A senha nunca é armazenada — só o hash scrypt, em `SETUP_PASSWORD_HASH` no
  `.env` do servidor (`npm run setup:senha` gera).
- Sessão em cookie `av_setup`: 8h, `HttpOnly`, `SameSite=Strict`. A chave de
  assinatura é **derivada** de `LINK_SECRET` + hash da senha: um token de clínica
  nunca valida como sessão de setup, e trocar a senha derruba toda sessão aberta.
- Gate no `proxy.ts` e de novo em cada rota (`exigirSessaoDeSetup`), no mesmo
  padrão do escopo de clínica.
- 5 senhas erradas em 15 min bloqueiam o IP (em memória; um container só).
- Tokens são **só de escrita**: a API nunca devolve o valor, só "configurado".
- `frame-ancestors 'none'` e `Cache-Control: no-store` na área inteira.

## Consequências

- O cadastro não depende mais do Clinic Control. Os dois continuam podendo
  gravar a mesma linha — quem salvar por último vence, sem aviso.
- **Custo aceito: senha compartilhada.** Não há registro de QUEM alterou; o log
  do servidor registra O QUÊ (nomes dos campos, nunca valores) e de qual IP a
  sessão foi aberta. Se a equipe crescer ou a auditoria importar, é o ponto a
  revisitar — contas individuais, com o mesmo gate.
- A regra "credenciais completas para o sistema escolhido" continua só na check
  constraint; o repositório traduz a recusa do banco em frase (sem terceira
  cópia, ver 0002).
- O cliente da API da Clinicorp saiu da fatia de sincronização para
  `providers/prontuario/clinicorp-api.ts`: o teste de conexão virou o segundo
  usuário, e fatias não importam umas das outras (0001).
