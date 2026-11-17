// Desafio da verificação alternativa do portão (ver ../pow.js).
import { novoDesafio } from '../pow'

export const dynamic = 'force-dynamic'
export async function GET() {
  return Response.json(novoDesafio(), { headers: { 'cache-control': 'no-store' } })
}
