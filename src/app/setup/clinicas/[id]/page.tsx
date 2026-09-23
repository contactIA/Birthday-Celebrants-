import { FormularioDeClinica } from '@/ui/setup/FormularioDeClinica'

export default async function PaginaDaClinica({ params }: PageProps<'/setup/clinicas/[id]'>) {
  const { id } = await params
  return <FormularioDeClinica id={id} />
}
