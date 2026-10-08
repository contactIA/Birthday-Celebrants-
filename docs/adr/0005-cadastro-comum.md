# 0005 — Ler a clínica do cadastro comum do CRM, atrás de uma variável

- **Status:** Aceito
- **Data:** 2026-10-07
- **Origem:** [ADR 0014 do CRM](https://github.com/contactIA/CRM-Contact-IA/blob/main/docs/adr/0014-setup-unificado-dos-produtos.md), issue [contactIA/CRM-Contact-IA#215](https://github.com/contactIA/CRM-Contact-IA/issues/215)

## Contexto

O CRM passou a ser o setup dos quatro produtos (CRM, Aniversariantes, Lembretes e
Schedule Button). A clínica, as unidades com os canais, o prontuário e o token da
plataforma moram num cadastro comum, no esquema `crm`, e este app o lê por quatro
visões só de leitura no esquema `cadastro` (`clinicas`, `unidades`, `produtos`,
`unidade_origens`), com os segredos cifrados pela `CADASTRO_CHAVE_CIFRAGEM`.

Até aqui a clínica vinha de `aniversariantes_clinicas` e `aniversariantes_unidades`
([0002](0002-banco-compartilhado.md), [0004](0004-unidades.md)), que o Clinic Control
também grava. Os modelos, os envios e o cache apontam, por chave estrangeira, para
essas duas tabelas.

Em produção, o cadastro só existe depois de quatro passos no CRM (a migração, o
esquema exposto, os tokens regravados com a chave nova e a importação de partida).
O deploy deste app não pode depender dessa ordem.

## Decisão

**1. Duas fontes, uma variável.** `CADASTRO_UNIFICADO` desligada (o padrão) deixa
tudo como hoje. Ligada, o acessor (`shared/clinica/repositorio.ts`) monta a clínica
pelas visões. Quem chama recebe a mesma `Clinica`, já no contexto da unidade, e não
sabe de qual fonte ela veio.

**2. Entra a clínica com o produto `aniversariantes` ligado** em `cadastro.produtos`.
No painel entram as unidades ativas com prontuário; sem prontuário não há de onde
ler aniversariantes. A principal é a do cadastro, ou, se ela ficou de fora, a
primeira em ordem alfabética.

**3. O id da unidade continua sendo o deste app** (`shared/clinica/montagem.ts`,
`idLocalDaUnidade`):

- a unidade que veio daqui pela importação usa o `id_na_origem` de
  `cadastro.unidade_origens` (origem `aniversariantes`), desde que a linha exista
  aqui e seja da mesma clínica. Os modelos, os envios e o cache dela seguem onde
  estão;
- a unidade que nasceu no setup do CRM usa o próprio id do cadastro.

**4. Âncoras locais.** A clínica ou a unidade que só existe no cadastro ganha, na
primeira leitura, uma linha em `aniversariantes_clinicas` ou
`aniversariantes_unidades`, só para as chaves estrangeiras. Nenhum segredo é
copiado: onde a check constraint exige valor, vai texto vazio. A unidade-âncora
nunca é a principal local, e um id que já é de outra clínica nunca é usado.

**5. O setup deste app só lê** os campos do cadastro, com o aviso de que se editam
no setup do CRM. As escritas da clínica e das unidades recusam
(`CadastroNoCrmError`). Ficam aqui o teste de conexão, a sincronização da Clinicorp,
o link do painel e os modelos de mensagem (no painel).

**6. O deploy confere antes de subir.** Com a variável ligada, o
`verificar-contrato.mjs` para o deploy se faltar a chave, se o esquema `cadastro`
não estiver exposto ou sem as colunas do contrato (`CONTRATO_DO_CADASTRO`), ou se a
chave não abrir os segredos das clínicas com o produto ligado.

## Alternativas consideradas

| Opção | Por que não |
|---|---|
| **Trocar o id das unidades pelo do cadastro** (migrar os modelos, os envios e o cache) | Uma migração de dados em três tabelas, sem volta fácil, para ganhar só a igualdade dos ids. O `id_na_origem` já liga as duas pontas. |
| **Casar as unidades pelo nome** | A importação já casou e gravou a origem; casar de novo divergiria dela no primeiro nome trocado. |
| **Criar as âncoras por migração** | Exigiria aplicar a migração na ordem certa com o CRM. Criar na leitura funciona em qualquer ordem e para clínica nova sem passo manual. |
| **Afrouxar as check constraints para a âncora** | Mudaria a tabela que o Clinic Control grava (0002) e pediria PR nos dois repos. O texto vazio cumpre a regra sem mudar nada. |

## Consequências

- O deploy deste código é seguro em qualquer ordem: desligada, a variável não toca
  no cadastro. Ligar é uma linha no `.env` e um `deploy.sh`.
- **As colunas antigas ficam sem uso com a leitura ligada:** as de credencial, de
  remetente e o campo de nascimento de `aniversariantes_clinicas`, e as de
  credencial e remetente de `aniversariantes_unidades`. A migração de limpeza fica
  para depois de a leitura estar ligada e estável, e depois da decisão sobre o
  Clinic Control (#211).
- **O que o Clinic Control grava** (o `upsert` no `slug`) deixa de chegar ao painel
  com a leitura ligada. Clínica provisionada só por lá não aparece: precisa do
  produto ligado no CRM.
- **Desligar volta ao que era**, com dois restos: as âncoras criadas (clínicas com
  as credenciais vazias, que o setup mostra como incompletas) e os modelos e envios
  feitos nas unidades-âncora, que continuam ligados a elas.
- A unidade-âncora da Clinicorp começa com o cache vazio, até a sincronização da
  madrugada ou o "Sincronizar agora".
- Unidade da importação sem a origem registrada perde, no painel, os modelos, os
  envios e o cache dela (que seguem no banco). Por isso a importação vem antes de
  ligar.
