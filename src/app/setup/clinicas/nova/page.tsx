import { connection } from 'next/server'
import { cadastroComumLigado } from '@/shared/clinica/repositorio'
import { NovaClinicaNoCadastroComum } from '@/ui/setup/CadastroComum'
import { FormularioDeClinica } from '@/ui/setup/FormularioDeClinica'

// `?companyId=&nome=` vem do botão "Cadastrar esta clínica" em Interessados:
// o cadastro já abre com a conta e o nome do pedido de vaga.
//
// Com o cadastro comum ligado (CADASTRO_UNIFICADO), clínica nova se cadastra no
// setup do CRM. `connection()` garante que a variável é lida a cada acesso, e
// não congelada no build.
export default async function PaginaDeNovaClinica({ searchParams }: PageProps<'/setup/clinicas/nova'>) {
  await connection()
  if (cadastroComumLigado()) return <NovaClinicaNoCadastroComum />

  const q = await searchParams
  const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
  return <FormularioDeClinica inicial={{ companyId: texto(q.companyId), nome: texto(q.nome) }} />
}
