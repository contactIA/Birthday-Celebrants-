import { db, type ClinicaRow, type EnvioRow, type UnidadeRow } from '@/shared/db'
import { companyIdsCadastrados, listarClinicasNoSetup } from '@/shared/clinica/repositorio'
import { resumirUso, type ClinicaLocal, type EnvioDoResumo, type ResumoDeUso, type UnidadeLocal } from './resumo'

// As leituras do resumo de uso. Só leitura e só colunas sem segredo: nada de
// credencial, telefone ou nome de paciente sai daqui.

/**
 * Linhas por página. É o `max-rows` padrão do PostgREST; se o projeto tiver um
 * teto menor, a leitura continua certa (ela só para na página vazia).
 */
const PAGINA = 1000

type EnvioLido = Pick<EnvioRow, 'id' | 'clinica_id' | 'status' | 'enviado_em' | 'scheduled_for' | 'created_at'>

/**
 * Todos os envios, de todas as clínicas, em páginas pelo id (keyset): sem
 * OFFSET, sem linha repetida ou pulada entre páginas, e uma consulta por página,
 * não por clínica. É um parabéns por paciente por ano: com dezenas de clínicas,
 * poucas dezenas de páginas no pior caso.
 */
async function lerEnvios(soDaClinica: string | null): Promise<EnvioDoResumo[]> {
  const envios: EnvioDoResumo[] = []
  let ultimoId: string | null = null

  for (;;) {
    let consulta = db()
      .from('aniversariantes_envios')
      .select('id, clinica_id, status, enviado_em, scheduled_for, created_at')
    if (soDaClinica) consulta = consulta.eq('clinica_id', soDaClinica)
    if (ultimoId) consulta = consulta.gt('id', ultimoId)
    const { data, error } = await consulta.order('id').limit(PAGINA).returns<EnvioLido[]>()
    if (error) throw new Error(`Erro ao ler os envios: ${error.message}`)
    if (!data || data.length === 0) return envios

    for (const l of data) {
      envios.push({
        clinicaId: l.clinica_id,
        status: l.status,
        enviadoEm: l.enviado_em,
        agendadoPara: l.scheduled_for,
        criadoEm: l.created_at,
      })
    }
    ultimoId = data[data.length - 1]!.id
  }
}

/** A tabela local inteira: inclui a clínica que teve o módulo desligado. São dezenas de linhas. */
async function lerClinicasLocais(): Promise<ClinicaLocal[]> {
  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .select('id, slug, nome')
    .returns<Pick<ClinicaRow, 'id' | 'slug' | 'nome'>[]>()
  if (error) throw new Error(`Erro ao ler as clínicas: ${error.message}`)
  return (data ?? []).map((c) => ({ id: c.id, companyId: c.slug, nome: c.nome }))
}

async function lerUnidadesLocais(): Promise<UnidadeLocal[]> {
  const { data, error } = await db()
    .from('aniversariantes_unidades')
    .select('id, clinica_id, nome')
    .returns<Pick<UnidadeRow, 'id' | 'clinica_id' | 'nome'>[]>()
  if (error) throw new Error(`Erro ao ler as unidades: ${error.message}`)
  return (data ?? []).map((u) => ({ id: u.id, clinicaId: u.clinica_id, nome: u.nome }))
}

/**
 * O resumo de uso de todas as clínicas.
 *
 * "Módulo ligado" vem de `companyIdsCadastrados`, que já decide pela fonte
 * certa: com o CADASTRO_UNIFICADO ligado, as contas com o produto
 * `aniversariantes` ligado no cadastro do CRM; desligado, as clínicas
 * cadastradas neste app. Os ids locais e as unidades vêm da lista do setup
 * (`listarClinicasNoSetup`); com o cadastro ligado, essa leitura também cria a
 * linha local que faltar, como já faz para o setup e os crons (ADR 0005).
 *
 * `soDaClinica` (o id local) é a leitura da API de integração, que fala de uma
 * clínica só: os envios lidos são só os dela, e a resposta só a traz.
 */
export async function buscarResumoDeUso(
  agora: Date,
  baseUrl: string | null,
  soDaClinica: string | null = null
): Promise<ResumoDeUso> {
  const [clinicasDoSetup, contasLigadas, clinicasLocais, unidadesLocais, envios] = await Promise.all([
    listarClinicasNoSetup(),
    companyIdsCadastrados(),
    lerClinicasLocais(),
    lerUnidadesLocais(),
    lerEnvios(soDaClinica),
  ])

  const resumo = resumirUso({
    modulo: 'aniversariantes',
    agora,
    baseUrl,
    clinicasLocais,
    unidadesLocais,
    clinicasDoSetup: clinicasDoSetup.map((c) => ({
      id: c.id,
      companyId: c.companyId,
      nome: c.nome,
      unidades: c.unidades.map((u) => ({ id: u.id, nome: u.nome })),
    })),
    contasLigadas,
    envios,
  })
  if (!soDaClinica) return resumo
  const id = soDaClinica.toLowerCase()
  return { ...resumo, clinicas: resumo.clinicas.filter((c) => c.setupId?.toLowerCase() === id) }
}
