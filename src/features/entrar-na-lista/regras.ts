import { paraE164BR } from '@/shared/telefone/e164'

// A regra do pedido de vaga no beta — o formulário da página que aparece para
// quem abre a aba sem ter a clínica cadastrada.
//
// O `company_id` NÃO está aqui: vem do escopo de acesso verificado pelo proxy
// (a aba da plataforma informa a conta), nunca do corpo. É o que impede alguém
// de pedir a vaga no lugar de outra clínica.

export const SISTEMAS = ['clinicorp', 'eclinica', 'outro'] as const
export type SistemaDoPedido = (typeof SISTEMAS)[number]

/** Limites de tamanho: o formulário é público dentro da aba — texto sem teto vira depósito de lixo. */
export const LIMITES = { nome: 120, modelo: 1000 } as const

export interface PedidoDeVaga {
  nomeClinica: string
  /** E.164 — normalizado aqui para a equipe ligar sem adivinhar o formato. */
  telefone: string
  sistemaProntuario: SistemaDoPedido
  modeloMensagem: string
}

export class PedidoDeVagaInvalidoError extends Error {
  readonly status = 400
  readonly codigo = 'PEDIDO_DE_VAGA_INVALIDO' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'PedidoDeVagaInvalidoError'
  }
}

function texto(bruto: unknown): string {
  return typeof bruto === 'string' ? bruto.trim() : ''
}

/** Lê e valida o corpo do formulário. Lança com frase para a tela. */
export function lerPedido(corpo: unknown): PedidoDeVaga {
  if (typeof corpo !== 'object' || corpo === null) {
    throw new PedidoDeVagaInvalidoError('Não foi possível ler o formulário')
  }
  const c = corpo as Record<string, unknown>

  if (c.consentimento !== true) {
    throw new PedidoDeVagaInvalidoError('Marque a autorização de contato para enviar')
  }

  const nomeClinica = texto(c.nomeClinica)
  if (!nomeClinica) throw new PedidoDeVagaInvalidoError('Informe o nome da clínica')
  if (nomeClinica.length > LIMITES.nome) throw new PedidoDeVagaInvalidoError('Nome da clínica muito longo')

  const telefone = paraE164BR(texto(c.telefone))
  if (!telefone) throw new PedidoDeVagaInvalidoError('Informe um telefone com DDD, como (62) 98187-8291')

  const sistema = texto(c.sistemaProntuario)
  if (!(SISTEMAS as readonly string[]).includes(sistema)) {
    throw new PedidoDeVagaInvalidoError('Escolha o sistema de prontuário da clínica')
  }

  const modeloMensagem = texto(c.modeloMensagem)
  if (!modeloMensagem) throw new PedidoDeVagaInvalidoError('Escreva a mensagem de aniversário que você gostaria de enviar')
  if (modeloMensagem.length > LIMITES.modelo) {
    throw new PedidoDeVagaInvalidoError(`A mensagem pode ter até ${LIMITES.modelo} caracteres`)
  }

  return { nomeClinica, telefone, sistemaProntuario: sistema as SistemaDoPedido, modeloMensagem }
}

/**
 * O texto da prévia: `{{nome}}` vira o paciente de exemplo e `{{clinica}}` o
 * nome digitado. A MESMA função serve à tela e aos testes, para a prévia não
 * mentir sobre o que foi escrito.
 */
export function previaDoModelo(modelo: string, nomeClinica: string, paciente = 'Marina'): string {
  return modelo
    .replaceAll('{{nome}}', paciente)
    .replaceAll('{{clinica}}', nomeClinica.trim() || 'sua clínica')
}
