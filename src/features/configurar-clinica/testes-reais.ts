import { hojeNoTimezone } from '@/shared/data/fuso'
import { provedorEClinica } from '@/providers/prontuario/eclinica'
import { clienteClinicorp } from '@/providers/prontuario/clinicorp-api'
import { mensageriaDe } from '@/providers/mensageria'
import { conferirRemetente, type DependenciasDoTeste } from './conexao'

// As dependências de verdade do teste de conexão — rede de verdade.
//
// Clinicorp: fala com a API DELES (`clinicorp-api.ts`), não com o adapter da
// porta, que lê o nosso cache e responderia "ok" com qualquer token.
// Custa UMA chamada à API — a cota da Clinicorp é apertada (ver o histórico do
// sync), e o teste não pode competir com o cron.

function plural(n: number, singular: string, pluralizado: string): string {
  return `${n} ${n === 1 ? singular : pluralizado}`
}

export function dependenciasReais(agora: Date): DependenciasDoTeste {
  return {
    async testarProntuario(clinica) {
      const hoje = hojeNoTimezone(clinica.timezone, agora)

      if (clinica.sistemaProntuario === 'clinicorp') {
        const data = `${hoje.ano}-${String(hoje.mes).padStart(2, '0')}-${String(hoje.dia).padStart(2, '0')}`
        const lista = await clienteClinicorp(clinica).aniversariantesDoDia(data)
        return `Clinicorp conectada: ${plural(lista.length, 'aniversariante', 'aniversariantes')} hoje`
      }

      const lista = await provedorEClinica(clinica).listarDoMes(hoje.mes)
      return `e-Clínica conectada: ${plural(lista.length, 'aniversariante', 'aniversariantes')} neste mês`
    },

    async testarMensageria(clinica) {
      const mensageria = mensageriaDe(clinica)
      const [{ modelos }, canais] = await Promise.all([mensageria.listarModelos(), mensageria.listarRemetentes()])
      const remetente = conferirRemetente(clinica.credenciais.mensageria.from, canais)
      if (!remetente.ok) throw new Error(remetente.mensagem)
      return `Conectada: ${plural(modelos.length, 'modelo aprovado', 'modelos aprovados')} · ${remetente.mensagem}`
    },
  }
}
