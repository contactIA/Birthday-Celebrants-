# 0001 — Vertical Slice em vez de camadas

- **Status:** Aceito
- **Data:** 2026-09-15

## Contexto

Este repositório reconstrói a feature que vivia em
[`g4bs2006/Aniversariantes`](https://github.com/g4bs2006/Aniversariantes). A
auditoria daquele código (HEAD `6929627`) encontrou três defeitos que têm a
mesma causa, e a causa não é falta de código bom — é **onde a regra mora**:

- `dia_envio` era oferecido na tela, validado por constraint e salvo no banco,
  mas o cálculo da data de envio ficava dentro do handler HTTP e nunca o lia.
  Quem escolhia "3 dias antes" recebia envio no próprio dia.
- O mapeamento de `{{n}}` para campo do paciente estava implementado **três
  vezes** — envio, prévia da tela, e uma terceira sem uso. As duas ativas já
  divergiam no campo ausente, então a prévia mentia sobre o envio.
- O agendamento aceitava o objeto de paciente inteiro vindo do navegador porque
  não havia fronteira que dissesse o que é dado confiável.

Os controllers **não** eram grandes — o de agendamento tem 113 linhas. O
problema era acoplamento, não volume: regra dentro do handler não pode ser
chamada de outro lugar nem testada sem subir HTTP.

## Alternativas consideradas

| Opção | Por que não |
|---|---|
| **MVC** | O App Router já impõe uma forma MVC-ish. Prescrevê-la é descrever o estado que produziu os defeitos. E MVC não opina sobre as duas perguntas que importam aqui: onde mora a regra de negócio e onde mora o switch entre prontuários. |
| **Clean Architecture completa** | Abstrai persistência que não se pode trocar — o Clinic Control lê as mesmas tabelas (ver [0002](0002-banco-compartilhado.md)). Camada de repositório e DTO em cada travessia cobrariam por opcionalidade inexistente. |
| **CQRS / event-driven** | Separa leitura de escrita para escalar independentemente. Não há esse problema, e viria com consistência eventual de brinde. |
| **Microsserviços** | Sem necessidade de escala independente, um dev, e o banco é compartilhado — serviços sobre banco compartilhado pagam a complexidade distribuída sem ganhar o isolamento que a justificaria. |

## Decisão

**Monolito único, organizado por fatia vertical.** Cada caso de uso é dono de
tudo que precisa — regra, acesso a dados, tradução HTTP — e fatias não dependem
umas das outras.

```
src/
  features/        # um diretório por caso de uso
  shared/          # kernel puro: data/fuso, telefone, mapeamento de template
  providers/       # as 2 portas que variam: prontuário e mensageria
  acesso/          # proxy e token — roda antes de qualquer fatia
```

Três regras que dão o contorno:

1. **`shared/` tem critério de entrada.** Só entra o que mais de uma fatia
   precisa aplicar de forma *idêntica*. Não é pasta de utilitário. O mapeamento
   de parâmetros é o caso exemplar: agendar e pré-visualizar têm que produzir o
   mesmo texto, e é justamente onde a duplicação virou bug.
2. **`shared/` é função pura.** Sem `next`, sem `supabase`, sem `fetch`, e sem
   `Date.now()` interno — o instante entra por parâmetro. É o que torna barato
   testar fuso, datas sentinela e telefone, que é onde a produção quebrou.
3. **Duas portas, não cinco.** Prontuário e mensageria são formalizados porque a
   variação é real e já observada (e-Clínica ao vivo, Clinicorp via cache, e um
   terceiro antecipado). Acesso a dados **não** é abstraído.

## Consequências

- O eixo de mudança passa a ser o caso de uso. Corrigir a regra de `dia_envio`
  toca uma pasta, não três camadas.
- Fatias podem ter formas diferentes sem forçar um molde comum:
  `sincronizar-clinicorp` é job em lote com concorrência limitada;
  `cancelar-envio` é quase CRUD.
- **Custo aceito:** com acesso a dados dentro de cada fatia, uma mudança de
  coluna vinda do Clinic Control tocaria N fatias em vez de um repositório
  central. Mitigado em [0002](0002-banco-compartilhado.md) — só uma das quatro
  tabelas tem consumidor externo, e ela ganha acessor único em `shared/clinica`.
- **Dependência invisível entre duas fatias:** o adapter Clinicorp lê o cache
  que `sincronizar-clinicorp` escreve. É a única do sistema, e precisa de
  comentário nos dois lados — senão alguém mexe numa e quebra a outra.
