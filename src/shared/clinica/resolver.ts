import type { ClinicaRow, SistemaProntuario, UnidadeRow } from '@/shared/db'

// Regras puras de unidade: de onde vêm as credenciais e qual unidade vale numa
// requisição. Sem banco aqui — é o que se testa sem subir nada (ADR 0001).

export interface CredenciaisDaUnidade {
  sistemaProntuario: SistemaProntuario
  eclinica: { token: string | null; baseUrl: string }
  clinicorp: {
    usuarioApi: string | null
    tokenApi: string | null
    subscriberId: string | null
    baseUrl: string
  }
  /** Número remetente e canal na plataforma de mensagens. */
  from: string | null
  channelId: string | null
}

/**
 * As credenciais da unidade.
 *
 * A PRINCIPAL lê da linha da clínica: é ali que o Clinic Control as grava, e
 * uma cópia na unidade divergiria no primeiro upsert de lá.
 *
 * As ADICIONAIS usam só o que é delas. Remetente ausente NÃO cai no da clínica
 * de propósito: a unidade sairia com o número de outra e ninguém notaria. Sem
 * remetente, vale o canal da conta — e o teste de conexão avisa quando a conta
 * tem mais de um.
 */
export function credenciaisDaUnidade(clinica: ClinicaRow, unidade: UnidadeRow): CredenciaisDaUnidade {
  if (unidade.principal) {
    return {
      sistemaProntuario: clinica.sistema_prontuario,
      eclinica: { token: clinica.eclinica_token, baseUrl: clinica.eclinica_base_url },
      clinicorp: {
        usuarioApi: clinica.clinicorp_usuario_api,
        tokenApi: clinica.clinicorp_token_api,
        subscriberId: clinica.clinicorp_subscriber_id,
        baseUrl: clinica.clinicorp_base_url,
      },
      from: clinica.helena_from,
      channelId: clinica.helena_channel_id,
    }
  }

  return {
    // O banco exige o sistema nas adicionais; o `??` só cobre tipo, não dado.
    sistemaProntuario: unidade.sistema_prontuario ?? clinica.sistema_prontuario,
    eclinica: {
      token: unidade.eclinica_token,
      baseUrl: unidade.eclinica_base_url ?? clinica.eclinica_base_url,
    },
    clinicorp: {
      usuarioApi: unidade.clinicorp_usuario_api,
      tokenApi: unidade.clinicorp_token_api,
      subscriberId: unidade.clinicorp_subscriber_id,
      baseUrl: unidade.clinicorp_base_url ?? clinica.clinicorp_base_url,
    },
    from: unidade.helena_from,
    channelId: unidade.helena_channel_id,
  }
}

/**
 * A unidade de uma requisição: a pedida, SE for desta clínica; senão a principal.
 *
 * Quem pede vem de um cookie, que o cliente controla. Um id de unidade de outra
 * clínica (ou lixo) não é erro nem vaza nada: cai na principal, e o filtro pelas
 * unidades DESTA clínica é o que impede a troca.
 */
export function escolherUnidade<U extends { id: string; principal: boolean }>(
  unidadesDaClinica: U[],
  pedida: string | null
): U | null {
  if (pedida) {
    const achada = unidadesDaClinica.find((u) => u.id === pedida)
    if (achada) return achada
  }
  return unidadesDaClinica.find((u) => u.principal) ?? null
}

/** Principal primeiro, depois por nome — a ordem em que o seletor as mostra. */
export function ordenarUnidades<U extends { nome: string; principal: boolean }>(unidades: U[]): U[] {
  return [...unidades].sort((a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome, 'pt-BR'))
}
