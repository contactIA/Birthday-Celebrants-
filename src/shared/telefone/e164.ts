// Normalização de telefone BR para E.164, exigida pelo campo `to` da plataforma
// de mensagens.
//
// Os cadastros vêm sujos de verdade — casos observados em produção:
// "9977-0408FILHA" (texto colado), "000000" (placeholder), fixo de 8 dígitos
// sem o "9" que virou padrão de celular. A validação é best-effort: a tela
// marca quem não passou e desabilita o agendamento para esse contato.

const DDDS_VALIDOS = /^(1[1-9]|2[12478]|3[1-8]|4[1-9]|5[13-5]|6[1-9]|7[134579]|8[1-9]|9[1-9])$/

function todosDigitosIguais(d: string): boolean {
  return d.length > 0 && /^(\d)\1*$/.test(d)
}

function validaNacional(nacional: string): boolean {
  if (nacional.length !== 10 && nacional.length !== 11) return false
  const ddd = nacional.slice(0, 2)
  const numero = nacional.slice(2)
  if (!DDDS_VALIDOS.test(ddd)) return false
  // Celular de 11 dígitos tem que começar com 9. Fixo de 10 começa com 2–5;
  // aceitamos 6–9 também porque a base tem celular antigo sem o nono dígito.
  if (numero.length === 9 && !numero.startsWith('9')) return false
  if (numero.startsWith('0') || numero.startsWith('1')) return false
  return true
}

export function paraE164BR(bruto: string | null | undefined): string | null {
  if (!bruto) return null
  const digitos = bruto.replace(/\D/g, '')
  if (!digitos) return null

  // "555555555555" é estruturalmente válido (DDD 55 existe) mas é claramente
  // placeholder. Sequência de um dígito só nunca é telefone real.
  if (todosDigitosIguais(digitos)) return null

  const nacional =
    (digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')
      ? digitos.slice(2)
      : digitos

  return validaNacional(nacional) ? `+55${nacional}` : null
}

/**
 * Telefone BR para LEITURA humana: "(62) 98187-8291", "(62) 3193-0175".
 *
 * Mesmo telefone, mesma cara em toda tela. Antes a Agenda mostrava o que veio
 * do prontuário e o Histórico o E.164 cru ("+5562981878291"). Aceita qualquer
 * formato que `paraE164BR` aceita; o que não reconhece volta como veio — é
 * exibição, não validação, e esconder o valor sujo esconderia o problema.
 */
export function formatarTelefoneBR(bruto: string | null | undefined): string {
  if (!bruto) return ''
  const e164 = paraE164BR(bruto)
  if (!e164) return bruto
  const nacional = e164.slice(3) // tira "+55"
  const ddd = nacional.slice(0, 2)
  const numero = nacional.slice(2)
  const corte = numero.length - 4
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
}

/** Só os dígitos, com o 55 na frente — para comparar números escritos de jeitos diferentes. */
export function digitosComPais(bruto: string | null | undefined): string | null {
  const e164 = paraE164BR(bruto)
  return e164 ? e164.slice(1) : null
}
