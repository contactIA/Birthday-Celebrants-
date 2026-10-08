import { connection } from 'next/server'
import { senhaDesligadaPor } from '@/acesso/setup'
import { Entrar } from '@/ui/setup/Entrar'

export default async function PaginaDeEntrar({ searchParams }: PageProps<'/setup/entrar'>) {
  // Lida a cada pedido, e não no build: SETUP_SENHA_DESLIGADA muda no .env do
  // servidor sem build novo.
  await connection()
  const { aviso } = await searchParams
  // Sem senha cadastrada (só o link do CRM abre), o formulário não teria o que
  // conferir: a tela já diz para abrir pelo setup do CRM.
  const semSenha = senhaDesligadaPor(process.env.SETUP_SENHA_DESLIGADA) || !process.env.SETUP_PASSWORD_HASH
  return (
    <Entrar
      senhaDesligada={semSenha}
      linkRecusado={aviso === 'link'}
    />
  )
}
