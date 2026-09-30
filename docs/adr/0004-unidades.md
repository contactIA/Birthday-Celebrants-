# 0004 — Unidades: várias por clínica, a principal lendo da linha da clínica

- **Status:** Aceito
- **Data:** 2026-09-30

## Contexto

Uma clínica (um `company_id`, um token na plataforma de mensagens) pode ter mais
de um endereço. Cada unidade tem **prontuário próprio** (e-Clínica ou Clinicorp,
com credenciais próprias), **número remetente próprio**, pacientes, modelos e
envios próprios. Antes, "clínica" era a unidade de tudo.

`aniversariantes_clinicas` tem consumidor externo (o Clinic Control faz `upsert`
nela, ver [0002](0002-banco-compartilhado.md)), então a solução não podia mover
nem remover coluna dela.

## Decisão

**Tabela `aniversariantes_unidades`**, filha de `aniversariantes_clinicas`.
`templates`, `envios` e `pacientes_cache` ganham `unidade_id` (as chaves únicas
passam a incluí-la — o mesmo paciente pode receber parabéns em duas unidades).

**A unidade principal lê as credenciais da linha da clínica.** Toda clínica tem
exatamente uma principal (índice único parcial), criada por trigger no insert da
clínica, então o `upsert` do Clinic Control continua valendo sem cópia para
divergir. As colunas de credencial da principal ficam nulas. Só as unidades
**adicionais** carregam credenciais próprias, sob a mesma regra de credenciais
completas (constraint no banco, não repetida em TypeScript).

O que continua da **clínica**: `company_id`, token da plataforma de mensagens,
campo de nascimento do contato, fuso.

**No código, `Clinica` passou a ser "a clínica no contexto de uma unidade"**
(`clinica.unidade`). Provedores e fatias seguem recebendo `Clinica`, só que
resolvida: prontuário e remetente são os da unidade, e as consultas escopadas
filtram também por `unidade_id`. A resolução é função pura em
`shared/clinica/resolver.ts`.

**Acesso.** O link continua por clínica (o token não muda). O painel ganha um
seletor de unidade, só quando há mais de uma. A escolha vai num cookie
(`av_unidade`) que é **preferência, não escopo**: o servidor a confere contra as
unidades da clínica do token a cada requisição, e id de outra clínica cai na
principal. Não há opção "todas as unidades".

**Crons** (sincronização Clinicorp e reconciliação de status) rodam por unidade:
`listarTodasAsClinicas()` devolve uma entrada por unidade. A trava do sync é por
unidade.

## Consequências

- Unidade adicional **sem número remetente não herda o da clínica**: sairia com o
  número de outra unidade sem ninguém notar. Sem remetente vale o canal da conta.
- Unidades novas começam **sem modelos**; cada uma configura os seus.
- Remover unidade só é permitido sem envios no histórico (o `cascade` os levaria).
- Ao aplicar a migration, o código anterior falha nos `upsert` (chaves antigas
  removidas) até o deploy novo subir. Aplicar imediatamente antes do deploy.
- O Clinic Control só enxerga a principal. Provisionar unidades extras por lá
  exigiria PR nos dois repos.
