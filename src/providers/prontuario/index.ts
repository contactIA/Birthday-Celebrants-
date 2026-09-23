import type { Clinica } from '@/shared/clinica/repositorio'
import { provedorEClinica } from './eclinica'
import { provedorClinicorp } from './clinicorp'
import { ProntuarioMalConfiguradoError, type ProvedorDeProntuario } from './porta'

export * from './porta'

/**
 * O provedor de prontuário da clínica.
 *
 * Este `switch` é a fronteira inteira entre os dois sistemas. No app anterior
 * ele vivia dentro do handler HTTP; aqui a rota nem sabe que existe escolha.
 *
 * Somar um terceiro provedor é: um arquivo novo neste diretório, um caso aqui,
 * e um valor a mais na check constraint de `sistema_prontuario`. Nenhum
 * componente de tela muda, porque o contrato de saída é o mesmo.
 */
export function provedorDe(clinica: Clinica): ProvedorDeProntuario {
  switch (clinica.sistemaProntuario) {
    case 'eclinica':
      return provedorEClinica(clinica)
    case 'clinicorp':
      return provedorClinicorp(clinica)
    default: {
      // Sistema novo no banco sem adapter aqui. Falha explícita, não silenciosa.
      const desconhecido: never = clinica.sistemaProntuario
      throw new ProntuarioMalConfiguradoError(
        `Sistema de prontuário não suportado: ${String(desconhecido)}`
      )
    }
  }
}
