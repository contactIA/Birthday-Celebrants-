import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { buscarClinicaPorId } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { mensageriaComCredenciais } from '@/providers/mensageria'
import { canaisParaEscolher } from '@/features/configurar-clinica/canais'
import { CadastroInvalidoError } from '@/features/configurar-clinica/regras'

// POST /api/setup/canais — os canais de WhatsApp da conta, cada um com as
// equipes que o atendem, para a pessoa ESCOLHER o remetente na gaveta. Ninguém
// precisa saber número, id de canal nem id de equipe: a lista vem da plataforma.
//
// Corpo: { id?, mensageriaToken? }. Mesma regra do teste de conexão: token
// digitado no formulário vale; em branco, na edição, usa o salvo. As unidades
// mandam o id da clínica — o token é da conta, não da unidade.

export async function POST(request: NextRequest) {
  try {
    exigirSessaoDeSetup(request)
    const corpo = (await request.json().catch(() => null)) as { id?: unknown; mensageriaToken?: unknown } | null
    const id = typeof corpo?.id === 'string' && corpo.id ? corpo.id : null
    const digitado = typeof corpo?.mensageriaToken === 'string' ? corpo.mensageriaToken.trim() : ''

    const salva = id ? await buscarClinicaPorId(id) : null
    const token = digitado || salva?.credenciais.mensageria.token
    if (!token) throw new CadastroInvalidoError('Informe o token da plataforma de mensagens para listar os canais')

    const mensageria = mensageriaComCredenciais({ token, from: null, channelId: null, equipeId: null, campoNascimento: null })
    const [canais, equipes] = await Promise.all([mensageria.listarCanais(), mensageria.listarEquipes()])
    return NextResponse.json({ canais: canaisParaEscolher(canais, equipes) })
  } catch (err) {
    return responderErro('api/setup/canais', err)
  }
}
