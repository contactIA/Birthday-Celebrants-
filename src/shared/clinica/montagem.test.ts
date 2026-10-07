import { describe, expect, it } from 'vitest'
import {
  CHAVE_DE_TESTE,
  CONTA,
  clinicaDoCadastro as linhaDaClinica,
  cifrar,
  origemDaUnidade,
  unidadeDoCadastro,
} from './cadastro-falso'
import { chaveDoCadastro } from './decifrador-do-cadastro'
import {
  ancoraDaClinica,
  ancoraDaUnidade,
  campoNascimentoDaConfiguracao,
  clinicaDoCadastro,
  clinicaNoSetupDoCadastro,
  clinicaPublicaDoCadastro,
  clinicasComOProdutoLigado,
  decifradorCom,
  idLocalDaUnidade,
  mapearUnidades,
  unidadesDoPainel,
  unidadesForaDoPainel,
  type ClinicaResolvida,
} from './montagem'

const decifrador = decifradorCom(() => chaveDoCadastro(CHAVE_DE_TESTE))

const UNIDADE_NO_CRM = 'a0000000-0000-4000-8000-000000000001'
const UNIDADE_AQUI = 'b0000000-0000-4000-8000-000000000001'

describe('idLocalDaUnidade: o id da unidade neste app', () => {
  it('a unidade veio daqui pela importação: vale o id que ela tinha aqui', () => {
    // É o que mantém os modelos, os envios e o cache da unidade.
    expect(idLocalDaUnidade(UNIDADE_NO_CRM, [origemDaUnidade()], new Set([UNIDADE_AQUI]))).toEqual({
      id: UNIDADE_AQUI,
      de: 'origem',
      criar: false,
    })
  })

  it('a unidade nasceu no setup do CRM: o próprio id do cadastro, e a linha local é criada', () => {
    expect(idLocalDaUnidade(UNIDADE_NO_CRM, [], new Set([UNIDADE_AQUI]))).toEqual({
      id: UNIDADE_NO_CRM,
      de: 'cadastro',
      criar: true,
    })
  })

  it('a linha com o id do cadastro já foi criada antes: não cria de novo', () => {
    expect(idLocalDaUnidade(UNIDADE_NO_CRM, [], new Set([UNIDADE_NO_CRM]))).toEqual({
      id: UNIDADE_NO_CRM,
      de: 'cadastro',
      criar: false,
    })
  })

  it('a origem aponta para unidade que não é desta clínica aqui: nunca é usada', () => {
    // O histórico de uma clínica não pode aparecer noutra.
    expect(idLocalDaUnidade(UNIDADE_NO_CRM, [origemDaUnidade()], new Set())).toEqual({
      id: UNIDADE_NO_CRM,
      de: 'cadastro',
      criar: true,
    })
  })

  it('origem de outro app não conta', () => {
    const doBotao = origemDaUnidade({ origem: 'botao' })
    expect(idLocalDaUnidade(UNIDADE_NO_CRM, [doBotao], new Set([UNIDADE_AQUI])).de).toBe('cadastro')
  })

  it('a origem de outra unidade do cadastro não conta', () => {
    const deOutra = origemDaUnidade({ unidade_id: 'a0000000-0000-4000-8000-000000000009' })
    expect(idLocalDaUnidade(UNIDADE_NO_CRM, [deOutra], new Set([UNIDADE_AQUI])).de).toBe('cadastro')
  })

  it('duas origens (a importação juntou duas unidades): a primeira, em ordem de id, que existe aqui', () => {
    const outra = 'b0000000-0000-4000-8000-000000000000'
    const origens = [origemDaUnidade(), origemDaUnidade({ id_na_origem: outra })]
    expect(idLocalDaUnidade(UNIDADE_NO_CRM, origens, new Set([UNIDADE_AQUI, outra])).id).toBe(outra)
    expect(idLocalDaUnidade(UNIDADE_NO_CRM, origens, new Set([UNIDADE_AQUI])).id).toBe(UNIDADE_AQUI)
  })

  it('sem diferença de maiúsculas, e o id sai sempre em minúsculas', () => {
    const origem = origemDaUnidade({ id_na_origem: ` ${UNIDADE_AQUI.toUpperCase()} ` })
    expect(idLocalDaUnidade(UNIDADE_NO_CRM.toUpperCase(), [origem], new Set([UNIDADE_AQUI])).id).toBe(UNIDADE_AQUI)
    expect(idLocalDaUnidade(UNIDADE_NO_CRM.toUpperCase(), [], new Set()).id).toBe(UNIDADE_NO_CRM)
  })
})

describe('mapearUnidades', () => {
  it('duas unidades com a mesma origem: a segunda cai no id do cadastro, com aviso', () => {
    const segunda = unidadeDoCadastro({ id: 'a0000000-0000-4000-8000-000000000002', nome: 'Norte', principal: false })
    const origens = [origemDaUnidade(), origemDaUnidade({ unidade_id: segunda.id })]
    const painel = unidadesDoPainel([unidadeDoCadastro(), segunda])
    const { unidades, avisos } = mapearUnidades(painel, origens, new Set([UNIDADE_AQUI]))
    expect(unidades.map((u) => u.idLocal.id)).toEqual([UNIDADE_AQUI, segunda.id])
    expect(avisos.join(' ')).toContain('repete o id local')
  })

  it('avisa a origem ignorada, sem impedir a leitura', () => {
    const { unidades, avisos } = mapearUnidades(unidadesDoPainel([unidadeDoCadastro()]), [origemDaUnidade()], new Set())
    expect(unidades[0]!.idLocal.de).toBe('cadastro')
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain(UNIDADE_AQUI)
  })
})

describe('as unidades do painel', () => {
  const centro = unidadeDoCadastro()
  const norte = unidadeDoCadastro({ id: 'a0000000-0000-4000-8000-000000000002', nome: 'Norte', principal: false })
  const antiga = unidadeDoCadastro({ id: 'a0000000-0000-4000-8000-000000000003', nome: 'Antiga', principal: false, ativa: false })
  const semProntuario = unidadeDoCadastro({
    id: 'a0000000-0000-4000-8000-000000000004',
    nome: 'Sul',
    principal: false,
    prontuario_sistema: null,
    prontuario_credenciais_cifradas: null,
  })

  it('entram as ativas com prontuário, principal primeiro', () => {
    const painel = unidadesDoPainel([norte, antiga, semProntuario, centro])
    expect(painel.map((u) => [u.unidade.nome, u.principal])).toEqual([
      ['Centro', true],
      ['Norte', false],
    ])
  })

  it('a principal do cadastro sem prontuário: a primeira em ordem alfabética faz o papel dela aqui', () => {
    const centroSem = { ...centro, prontuario_sistema: null, prontuario_credenciais_cifradas: null }
    const sudeste = { ...norte, id: 'a0000000-0000-4000-8000-000000000005', nome: 'Sudeste' }
    const painel = unidadesDoPainel([sudeste, centroSem, norte])
    expect(painel.map((u) => [u.unidade.nome, u.principal])).toEqual([
      ['Norte', true],
      ['Sudeste', false],
    ])
  })

  it('as de fora, com o motivo', () => {
    expect(unidadesForaDoPainel([centro, antiga, semProntuario])).toEqual([
      { nome: 'Antiga', motivo: 'inativa' },
      { nome: 'Sul', motivo: 'sem_prontuario' },
    ])
  })
})

describe('o produto e a configuração', () => {
  it('só entra a clínica com o produto aniversariantes ligado', () => {
    const ligadas = clinicasComOProdutoLigado([
      { clinica_id: 'a', company_id: CONTA, produto: 'aniversariantes', ligado: true, configuracao: {} },
      { clinica_id: 'b', company_id: CONTA, produto: 'aniversariantes', ligado: false, configuracao: {} },
      { clinica_id: 'c', company_id: CONTA, produto: 'lembretes', ligado: true, configuracao: {} },
    ])
    expect([...ligadas]).toEqual(['a'])
  })

  it('o campo da data de nascimento sai da configuração; fora do formato, nenhum', () => {
    expect(campoNascimentoDaConfiguracao({ campoNascimento: ' data-de-nascimento ' })).toBe('data-de-nascimento')
    expect(campoNascimentoDaConfiguracao({ campoNascimento: null })).toBeNull()
    expect(campoNascimentoDaConfiguracao({ campoNascimento: '  ' })).toBeNull()
    expect(campoNascimentoDaConfiguracao({ campoNascimento: 42 })).toBeNull()
    expect(campoNascimentoDaConfiguracao({})).toBeNull()
    expect(campoNascimentoDaConfiguracao(['data'])).toBeNull()
    expect(campoNascimentoDaConfiguracao(null)).toBeNull()
  })
})

function resolvida(unidades = [unidadeDoCadastro()], clinica = linhaDaClinica()): ClinicaResolvida {
  const { unidades: mapeadas } = mapearUnidades(unidadesDoPainel(unidades), [origemDaUnidade()], new Set([UNIDADE_AQUI]))
  return {
    clinica,
    idLocal: 'd0000000-0000-4000-8000-000000000001',
    criadaEm: '2026-09-15T12:00:00Z',
    campoNascimento: 'data-de-nascimento',
    unidades: mapeadas,
    foraDoPainel: [],
  }
}

describe('clinicaDoCadastro: a Clinica de hoje, montada das visões', () => {
  it('Clinicorp: nome, fuso e token da clínica; prontuário, remetente, canal e equipe da unidade; ids locais', () => {
    const r = resolvida()
    expect(clinicaDoCadastro(r, r.unidades[0]!, decifrador)).toEqual({
      id: 'd0000000-0000-4000-8000-000000000001',
      companyId: CONTA,
      nome: 'Prev Odonto',
      unidade: { id: UNIDADE_AQUI, nome: 'Centro', principal: true },
      sistemaProntuario: 'clinicorp',
      timezone: 'America/Sao_Paulo',
      credenciais: {
        eclinica: { token: null, baseUrl: 'https://eclinica.app/api/v2' },
        clinicorp: {
          usuarioApi: 'api@prev',
          tokenApi: 'token-clinicorp',
          subscriberId: 'prevodonto',
          baseUrl: 'https://api.clinicorp.com/rest/v1',
        },
        mensageria: {
          token: 'token-da-plataforma',
          from: '5545999990001',
          channelId: 'canal-centro',
          equipeId: 'e0000000-0000-4000-8000-000000000001',
          campoNascimento: 'data-de-nascimento',
        },
      },
    })
  })

  it('e-Clínica: token e endereço da API', () => {
    const eclinica = unidadeDoCadastro({
      prontuario_sistema: 'eclinica',
      prontuario_credenciais_cifradas: cifrar(JSON.stringify({ token: 'tok-eclinica', baseUrl: 'https://outra.eclinica.app/api/v2' })),
    })
    const r = resolvida([eclinica])
    const c = clinicaDoCadastro(r, r.unidades[0]!, decifrador)
    expect(c.sistemaProntuario).toBe('eclinica')
    expect(c.credenciais.eclinica).toEqual({ token: 'tok-eclinica', baseUrl: 'https://outra.eclinica.app/api/v2' })
    expect(c.credenciais.clinicorp.tokenApi).toBeNull()
  })

  it('sem token no cadastro: o token fica vazio, e o painel ainda lista', () => {
    const r = resolvida(undefined, linhaDaClinica({ token_plataforma_cifrado: null }))
    expect(clinicaDoCadastro(r, r.unidades[0]!, decifrador).credenciais.mensageria.token).toBe('')
  })

  it('unidade sem canal de envio: remetente, canal e equipe nulos, como hoje', () => {
    const semCanal = unidadeDoCadastro({ canal_envio_id: null, canal_envio_numero: null, equipe_envio_id: null })
    const r = resolvida([semCanal])
    const { from, channelId, equipeId } = clinicaDoCadastro(r, r.unidades[0]!, decifrador).credenciais.mensageria
    expect([from, channelId, equipeId]).toEqual([null, null, null])
  })

  it('segredo que não abre com a chave: erro que diz o quê, nunca o valor', () => {
    const r = resolvida(undefined, linhaDaClinica({ token_plataforma_cifrado: cifrar('token-secreto', Buffer.alloc(32, 9).toString('base64')) }))
    expect(() => clinicaDoCadastro(r, r.unidades[0]!, decifrador)).toThrow(/token da plataforma/)
    try {
      clinicaDoCadastro(r, r.unidades[0]!, decifrador)
    } catch (err) {
      expect((err as Error).message).not.toContain('token-secreto')
    }
  })

  it('credencial que não é JSON: o erro não cita o conteúdo', () => {
    const r = resolvida([unidadeDoCadastro({ prontuario_credenciais_cifradas: cifrar('senha123 não é json') })])
    expect(() => clinicaDoCadastro(r, r.unidades[0]!, decifrador)).toThrow(/não é um JSON/)
    expect(() => clinicaDoCadastro(r, r.unidades[0]!, decifrador)).not.toThrow(/senha123/)
  })
})

describe('o cabeçalho e o setup', () => {
  it('o cabeçalho do painel não decifra nada e lista as unidades pelo id local', () => {
    const norte = unidadeDoCadastro({ id: 'a0000000-0000-4000-8000-000000000002', nome: 'Norte', principal: false })
    const r = resolvida([unidadeDoCadastro(), norte])
    expect(clinicaPublicaDoCadastro(r, r.unidades[1]!)).toEqual({
      id: 'd0000000-0000-4000-8000-000000000001',
      companyId: CONTA,
      nome: 'Prev Odonto',
      unidades: [
        { id: UNIDADE_AQUI, nome: 'Centro', principal: true },
        { id: norte.id, nome: 'Norte', principal: false },
      ],
      unidadeAtualId: norte.id,
    })
  })

  it('o setup mostra o cadastro só para leitura e sem o valor de segredo nenhum', () => {
    const setup = clinicaNoSetupDoCadastro(resolvida(), decifrador)
    expect(setup.cadastroComum).toBe(true)
    expect(setup.sistemaProntuario).toBe('clinicorp')
    expect(setup.unidades[0]).toMatchObject({
      id: UNIDADE_AQUI,
      clinicorp: { usuarioApi: 'api@prev', tokenConfigurado: true, subscriberId: 'prevodonto' },
      mensageria: { from: '5545999990001' },
    })
    expect(setup.mensageria).toMatchObject({ tokenConfigurado: true, campoNascimento: 'data-de-nascimento' })
    const texto = JSON.stringify(setup)
    expect(texto).not.toContain('token-clinicorp')
    expect(texto).not.toContain('token-da-plataforma')
  })

  it('credenciais que não abrem: o setup avisa em vez de cair', () => {
    const chaveErrada = decifradorCom(() => Buffer.alloc(32, 1))
    const setup = clinicaNoSetupDoCadastro(resolvida(), chaveErrada)
    expect(setup.unidades[0]).toMatchObject({ sistemaProntuario: 'clinicorp', credenciaisIlegiveis: true })
  })

  it('sem unidade no painel: o setup abre, sem prontuário', () => {
    const setup = clinicaNoSetupDoCadastro(resolvida([]), decifrador)
    expect(setup.unidades).toEqual([])
    expect(setup.sistemaProntuario).toBeNull()
  })
})

describe('as âncoras locais', () => {
  it('a clínica: a conta em minúsculas e nenhum segredo, só o vazio que o banco exige', () => {
    const linha = ancoraDaClinica(linhaDaClinica({ company_id: CONTA.toUpperCase(), nome: 'x'.repeat(200) }))
    expect(linha).toMatchObject({ slug: CONTA, helena_token: '', sistema_prontuario: 'eclinica', eclinica_token: '' })
    // O gatilho da principal copia o nome da clínica para a unidade, que aceita até 120.
    expect(linha.nome).toHaveLength(120)
    expect(JSON.stringify(linha)).not.toContain('token-da-plataforma')
  })

  it('a unidade: o id local, nunca a principal, e o vazio na credencial do sistema dela', () => {
    const r = resolvida([unidadeDoCadastro({ nome: '  ' })], linhaDaClinica())
    const [u] = mapearUnidades(unidadesDoPainel([unidadeDoCadastro()]), [], new Set()).unidades
    expect(ancoraDaUnidade(u!, r.idLocal)).toMatchObject({
      id: UNIDADE_NO_CRM,
      clinica_id: r.idLocal,
      nome: 'Centro',
      principal: false,
      sistema_prontuario: 'clinicorp',
      clinicorp_usuario_api: '',
      clinicorp_token_api: '',
      clinicorp_subscriber_id: '',
      eclinica_token: null,
    })
    const semNome = { ...u!, unidade: { ...u!.unidade, nome: '  ' } }
    expect(ancoraDaUnidade(semNome, r.idLocal).nome).toBe('Unidade')
  })
})
