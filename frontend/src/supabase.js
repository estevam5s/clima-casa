import { createClient } from '@supabase/supabase-js'

// A URL e a chave publishable vêm do backend (/api/supabase-config), nunca a chave secret.
let cliente = null
let carregando = null

export function supabase() {
  if (cliente) return Promise.resolve(cliente)
  if (!carregando) {
    carregando = fetch('/api/supabase-config')
      .then((r) => {
        if (!r.ok) throw new Error('Não foi possível carregar a configuração do Supabase.')
        return r.json()
      })
      .then(({ url, chave }) => {
        cliente = createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'clima-casa-auth' } })
        return cliente
      })
      .catch((e) => {
        carregando = null
        throw e
      })
  }
  return carregando
}

export async function tokenAtual() {
  const sb = await supabase()
  const { data } = await sb.auth.getSession()
  return data.session?.access_token || null
}
