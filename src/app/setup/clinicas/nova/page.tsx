import { FormularioDeClinica } from '@/ui/setup/FormularioDeClinica'

// `?companyId=&nome=` vem do botão "Cadastrar esta clínica" em Interessados:
// o cadastro já abre com a conta e o nome do pedido de vaga.
export default async function PaginaDeNovaClinica({ searchParams }: PageProps<'/setup/clinicas/nova'>) {
  const q = await searchParams
  const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
  return <FormularioDeClinica inicial={{ companyId: texto(q.companyId), nome: texto(q.nome) }} />
}
