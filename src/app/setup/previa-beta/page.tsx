import { PaginaBeta } from '@/ui/beta/PaginaBeta'

// A página de beta, como a clínica sem cadastro a vê — para a equipe conferir
// ou mostrar. Protegida pela sessão de setup como o resto da área.
export default function PaginaDePreviaDoBeta() {
  return <PaginaBeta previa />
}
