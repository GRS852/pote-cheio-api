// Apaga arquivos do Supabase Storage (fotos de perfil, das doações e dos
// comentários) quando a conta é excluída.
//
// Precisa da chave service_role do Supabase em SUPABASE_SERVICE_ROLE_KEY
// (só no .env do servidor, nunca no site). Sem ela, só registra no log e
// segue: os dados do banco são apagados do mesmo jeito.
const BUCKET = 'imagens-potecheio'

function storagePath(url: string, supabaseUrl: string): string | null {
  const prefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`
  if (!url.startsWith(prefix)) return null // ex.: foto da conta Google
  const path = decodeURIComponent(url.slice(prefix.length).split('?')[0])
  return path && !path.includes('..') ? path : null
}

export async function deleteStorageFiles(urls: (string | null | undefined)[]): Promise<void> {
  const supabaseUrl = (process.env.SUPABASE_URL || 'https://oguvupgbutzkudpeurgr.supabase.co').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const paths = [...new Set(urls.filter((u): u is string => !!u).map(u => storagePath(u, supabaseUrl)).filter((p): p is string => !!p))]
  if (paths.length === 0) return
  if (!key) {
    console.warn(`[storage] SUPABASE_SERVICE_ROLE_KEY ausente: ${paths.length} arquivo(s) não foram apagados do Storage`)
    return
  }

  try {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    })
    if (!response.ok) console.error(`[storage] Falha ao apagar arquivos (${response.status}): ${await response.text()}`)
  } catch (error) {
    console.error('[storage] Falha ao apagar arquivos:', error)
  }
}
