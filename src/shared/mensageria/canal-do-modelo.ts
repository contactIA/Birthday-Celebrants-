import { digitosComPais, formatarTelefoneBR } from '@/shared/telefone/e164'

// Por qual número um modelo sai.
//
// Na plataforma, cada modelo aprovado é de UM canal (número). O mesmo texto
// aprovado em cinco números são cinco modelos com o mesmo nome — e agendar por
// um remetente que não é o canal do modelo falha paciente por paciente
// ("Modelo de mensagem não esta associado a esse canal"). Caso real, no app de
// lembretes (2026-10-09): cinco cartões iguais na tela de modelos, o escolhido
// era de outro número, e o lote terminou com cinco recusas e nenhum envio.
//
// A tela de modelos, o painel de envio, o salvar e o lote chamam ESTA
// conferência: a tela não pode dizer "ok" ao que o lote vai recusar.

/** O que a regra precisa de um canal da conta. */
interface Canal {
  id: string
  /** Dígitos com país ("556231930175"). */
  numero: string
  nome: string
  ativo: boolean
}

/** Um número, pronto para a tela. */
export interface NumeroDeEnvio {
  numero: string
  nome: string
}

export interface EnvioDoModelo {
  /** O número do modelo; `null` = o modelo não diz o canal, ou o canal não está mais na conta. */
  numero: NumeroDeEnvio | null
  /** O número por onde a clínica agenda; `null` = não dá para saber qual. */
  remetente: NumeroDeEnvio | null
  /** `null` = falta um dos dois lados, não há o que conferir. */
  saiPeloRemetente: boolean | null
}

/**
 * O canal por onde a clínica agenda: o do remetente cadastrado; sem remetente,
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

function paraNumero(canal: Canal): NumeroDeEnvio {
  return { numero: canal.numero, nome: canal.nome }
}

export function envioDoModelo(canalDoModelo: string | null, remetente: string | null, canais: Canal[]): EnvioDoModelo {
  const doRemetente = canalDoRemetente(remetente, canais)
  const doModelo = canalDoModelo ? canais.find((c) => c.id === canalDoModelo) : undefined
  return {
    numero: doModelo ? paraNumero(doModelo) : null,
    remetente: doRemetente ? paraNumero(doRemetente) : null,
    saiPeloRemetente: doRemetente && canalDoModelo ? canalDoModelo === doRemetente.id : null,
  }
}

/** A frase para quando o modelo NÃO sai pelo remetente; `null` quando sai (ou não há como saber). */
export function motivoDeNaoSair(envio: EnvioDoModelo): string | null {
  if (envio.saiPeloRemetente !== false || !envio.remetente) return null
  const daClinica = formatarTelefoneBR(envio.remetente.numero)
  const doModelo = envio.numero
    ? `Este modelo é do número ${formatarTelefoneBR(envio.numero.numero)}`
    : 'Este modelo é de um número que não está mais na conta'
  return (
    `${doModelo}, e esta clínica agenda pelo ${daClinica}: a plataforma de mensagens recusaria as mensagens. ` +
    `Use um modelo do ${daClinica}, ou peça a quem administra a conta para criar este modelo nesse número.`
  )
}
