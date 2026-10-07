// A variável que liga a leitura da clínica pelo cadastro comum dos produtos
// (ADR 0014 do CRM, contactIA/CRM-Contact-IA#215).
//
// DESLIGADA, o app lê aniversariantes_clinicas e aniversariantes_unidades, como
// sempre leu. LIGADA, lê as visões do esquema `cadastro` do CRM. Só se liga
// depois de o cadastro existir em produção (docs/cadastro-unificado.md): até lá,
// o deploy deste código não muda nada.
//
// Função pura, sem `process.env` dentro: quem chama passa o valor. Sem import de
// valor também: `scripts/verificar-contrato.mjs` importa este arquivo direto pelo
// Node (type stripping), onde o alias `@/` não existe.

export const VARIAVEL_DO_CADASTRO_UNIFICADO = 'CADASTRO_UNIFICADO'

/** Os valores que ligam. Qualquer outro, inclusive vazio ou ausente, desliga. */
const LIGA = ['1', 'true', 'sim', 'ligado']

export function cadastroUnificadoLigado(valor: string | undefined): boolean {
  return typeof valor === 'string' && LIGA.includes(valor.trim().toLowerCase())
}
