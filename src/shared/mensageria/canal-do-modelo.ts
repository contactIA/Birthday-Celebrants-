import { digitosComPais, formatarTelefoneBR } from '@/shared/telefone/e164'

// Por qual número um modelo sai, e se esta unidade pode usá-lo.
//
// Na plataforma, cada modelo aprovado é de UM canal (número). O mesmo texto
// aprovado em cinco números são cinco modelos com o mesmo nome — e agendar por
// um remetente que não é o canal do modelo falha paciente por paciente
// ("Modelo de mensagem não esta associado a esse canal"). Caso real, no app de
// lembretes (2026-10-09): cinco cartões iguais na tela de modelos, o escolhido
// era de outro número, e o lote terminou com cinco recusas e nenhuma mensagem.
//
// Desde 2026-10-10 a mensagem sai PELO NÚMERO DO MODELO, e não só pelo
// remetente da unidade (decisão do Gabriel). Qualquer número da conta serve,
// MENOS os cadastrados em outra unidade da clínica (cadastro do CRM). Quando o
// número não é o remetente, a equipe que agenda é escolhida aqui também
// (`equipeDoCanal`): a plataforma recusa equipe que não atende o número.
//
// Sem o cadastro comum não se sabe de quem é cada número, e vale a regra de
// antes: só o remetente.
//
// A tela de modelos, o painel de envio, o salvar e o lote chamam ESTA regra: a
// tela não pode dizer "ok" ao que o lote vai recusar.

/** O que a regra precisa de um canal da conta. */
interface Canal {
  id: string
  /** Dígitos com país ("556231930175"). */
  numero: string
  nome: string
  ativo: boolean
}

/** O que a regra precisa de uma equipe da conta. */
export interface Equipe {
  id: string
  nome: string
  padrao: boolean
  /** Os canais que a equipe atende: todos os da conta, ou só os listados (ids). */
  canais: 'todos' | string[]
}

/** Um canal cadastrado em outra unidade da mesma clínica. */
export interface CanalDeOutraUnidade {
  canalId: string
  /** O nome da unidade, para a frase. */
  unidade: string
}

/**
 * De onde a unidade envia. Tem os nomes das credenciais de mensageria da
 * `Clinica`, que serve direto aqui.
 */
export interface UnidadeQueEnvia {
  /** O número por onde a unidade agenda (o remetente cadastrado). */
  from: string | null
  /** A equipe da unidade. `null` = a padrão da conta. */
  equipeId: string | null
  /**
   * Os canais das OUTRAS unidades da clínica: por eles esta não envia. `null` =
   * sem o cadastro comum, não se sabe de quem é cada número, e só o remetente vale.
   */
  deOutrasUnidades: readonly CanalDeOutraUnidade[] | null
}

/** Um número, pronto para a tela. */
export interface NumeroDeEnvio {
  numero: string
  nome: string
}

/** Por que a unidade não pode usar o modelo. */
export type Recusa =
  /** Sem o cadastro comum: o modelo não é do remetente. */
  | { tipo: 'fora-do-remetente' }
  | { tipo: 'de-outra-unidade'; unidade: string }
  /** O canal do modelo saiu da conta ou está desativado. */
  | { tipo: 'fora-da-conta' }
  /** Nenhuma equipe da conta atende o número do modelo. */
  | { tipo: 'sem-equipe' }

export interface EnvioDoModelo {
  /** O número do modelo; `null` = o modelo não diz o canal, ou o canal não está mais na conta. */
  numero: NumeroDeEnvio | null
  /** O número por onde a unidade agenda; `null` = não dá para saber qual. */
  remetente: NumeroDeEnvio | null
  /** `null` = falta um dos dois lados, não há o que comparar. */
  saiPeloRemetente: boolean | null
  /**
   * O modelo sai por um número da conta que não é o remetente: o pedido de
   * agendamento leva esse número e a equipe (`equipe`).
   */
  porOutroNumero: boolean
  /**
   * A equipe que agenda pelo número do modelo, quando ele não é o remetente.
   * `null` = vale a da unidade, ou as equipes ainda não foram consultadas.
   */
  equipe: { id: string; nome: string } | null
  /** `true` pode usar; `false` não pode (ver `recusa`); `null` = não há o que conferir. */
  permitido: boolean | null
  recusa: Recusa | null
}

/**
 * O canal por onde a unidade agenda: o do remetente cadastrado; sem remetente,
 * o único canal ativo da conta (é o que a plataforma usa).
 *
 * `null` quando não dá para saber: remetente que não é canal da conta (o teste
 * de conexão acusa isso), ou conta com vários canais e nenhum escolhido.
 */
export function canalDoRemetente<C extends Canal>(remetente: string | null, canais: C[]): C | null {
  const ativos = canais.filter((c) => c.ativo)
  if (!remetente?.trim()) return ativos.length === 1 ? ativos[0]! : null
  const alvo = digitosComPais(remetente)
  return ativos.find((c) => c.numero === alvo) ?? null
}

/**
 * A equipe que agenda por um canal: a da unidade, se atende o canal; senão a
 * padrão da conta, se atende; senão a que atende (havendo mais de uma, a
 * primeira pelo nome). `null` = nenhuma atende, e a plataforma recusaria.
 */
export function equipeDoCanal<E extends Equipe>(canalId: string, equipeDaUnidade: string | null, equipes: readonly E[]): E | null {
  const atendem = equipes.filter((e) => e.canais === 'todos' || e.canais.includes(canalId))
  return (
    atendem.find((e) => e.id === equipeDaUnidade) ??
    atendem.find((e) => e.padrao) ??
    [...atendem].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))[0] ??
    null
  )
}

function paraNumero(canal: Canal): NumeroDeEnvio {
  return { numero: canal.numero, nome: canal.nome }
}

/**
 * Por qual número o modelo sai e se a unidade pode usá-lo.
 *
 * `equipes`: só quando o modelo sai por outro número (`porOutroNumero`) a equipe
 * importa. Sem elas, o envio vem sem equipe escolhida; quem vai agendar ou
 * mostrar a equipe consulta as equipes e chama de novo com elas. Assim, quem
 * envia só pelo remetente não faz consulta nenhuma a mais.
 */
export function envioDoModelo(
  canalDoModelo: string | null,
  unidade: UnidadeQueEnvia,
  canais: Canal[],
  equipes: readonly Equipe[] | null = null
): EnvioDoModelo {
  const doRemetente = canalDoRemetente(unidade.from, canais)
  const doModelo = canalDoModelo ? canais.find((c) => c.id === canalDoModelo) : undefined
  const saiPeloRemetente = doRemetente && canalDoModelo ? canalDoModelo === doRemetente.id : null
  const base = {
    numero: doModelo ? paraNumero(doModelo) : null,
    remetente: doRemetente ? paraNumero(doRemetente) : null,
    saiPeloRemetente,
    porOutroNumero: false,
    equipe: null,
  }
  const recusar = (recusa: Recusa): EnvioDoModelo => ({ ...base, permitido: false, recusa })

  if (unidade.deOutrasUnidades === null) {
    return saiPeloRemetente === false ? recusar({ tipo: 'fora-do-remetente' }) : { ...base, permitido: saiPeloRemetente, recusa: null }
  }
  // O modelo que não diz o canal sai pelo remetente, e quem decide é a plataforma.
  if (!canalDoModelo || saiPeloRemetente) return { ...base, permitido: saiPeloRemetente, recusa: null }

  if (!doModelo?.ativo) return recusar({ tipo: 'fora-da-conta' })
  const deOutra = unidade.deOutrasUnidades.find((o) => o.canalId === canalDoModelo)
  if (deOutra) return recusar({ tipo: 'de-outra-unidade', unidade: deOutra.unidade })

  const porOutro = { ...base, porOutroNumero: true }
  if (!equipes) return { ...porOutro, permitido: true, recusa: null }
  const equipe = equipeDoCanal(canalDoModelo, unidade.equipeId, equipes)
  if (!equipe) return { ...porOutro, permitido: false, recusa: { tipo: 'sem-equipe' } }
  return { ...porOutro, equipe: { id: equipe.id, nome: equipe.nome }, permitido: true, recusa: null }
}

/** A frase para quando a unidade NÃO pode usar o modelo; `null` quando pode (ou não há como saber). */
export function motivoDeNaoSair(envio: EnvioDoModelo): string | null {
  const recusa = envio.recusa
  if (!recusa) return null
  const doModelo = envio.numero ? formatarTelefoneBR(envio.numero.numero) : null
  switch (recusa.tipo) {
    case 'fora-do-remetente': {
      if (!envio.remetente) return null
      const daClinica = formatarTelefoneBR(envio.remetente.numero)
      const frase = doModelo ? `Este modelo é do número ${doModelo}` : 'Este modelo é de um número que não está mais na conta'
      return (
        `${frase}, e esta clínica agenda pelo ${daClinica}: a plataforma de mensagens recusaria as mensagens. ` +
        `Use um modelo do ${daClinica}, ou peça a quem administra a conta para criar este modelo nesse número.`
      )
    }
    case 'de-outra-unidade':
      return (
        `Este modelo é do número ${doModelo}, da unidade ${recusa.unidade}, e esta unidade não envia por ele. ` +
        'Use um modelo de outro número, ou peça a quem administra a conta para criar este modelo num número desta unidade.'
      )
    case 'fora-da-conta':
      return doModelo
        ? `Este modelo é do número ${doModelo}, que está desativado na conta: a plataforma de mensagens recusaria as mensagens. Use um modelo de outro número.`
        : 'Este modelo é de um número que não está mais na conta: a plataforma de mensagens recusaria as mensagens. Use um modelo de outro número.'
    case 'sem-equipe':
      return (
        `Nenhuma equipe da conta atende o número ${doModelo ?? 'deste modelo'}: a plataforma de mensagens recusaria as mensagens. ` +
        'Peça a quem administra a conta para incluir esse número numa equipe, ou use um modelo de outro número.'
      )
  }
}
