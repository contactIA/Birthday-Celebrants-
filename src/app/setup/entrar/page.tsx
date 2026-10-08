import { connection } from 'next/server'
import { senhaDesligadaPor } from '@/acesso/setup'
import { Entrar } from '@/ui/setup/Entrar'

export default async function PaginaDeEntrar({ searchParams }: PageProps<'/setup/entrar'>) {
  // Lida a cada pedido, e não no build: SETUP_SENHA_DESLIGADA muda no .env do
  // servidor sem build novo.
  await connection()
  const { aviso } = await searchParams
  return (
    <Entrar
      senhaDesligada={senhaDesligadaPor(process.env.SETUP_SENHA_DESLIGADA)}
      linkRecusado={aviso === 'link'}
    />
  )
}
