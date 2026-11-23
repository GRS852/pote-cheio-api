// Versão atual dos Termos de Uso e da Política de Privacidade. Ao mudar o
// texto de forma relevante, troque a versão: quem aceitou a anterior verá o
// pedido de aceite de novo no próximo acesso.
export const TERMS_VERSION = '2026-11'

// Idade mínima para usar a plataforma (entrega presencial entre desconhecidos)
export const MIN_AGE = 18

// Aceita só 'AAAA-MM-DD' que seja uma data real (rejeita 2000-02-31)
export function parseBirthDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

export function ageOn(birth: Date, today = new Date()): number {
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age--
  return age
}

// Confere aceite e idade enviados no cadastro. Devolve o erro (para a
// resposta 400) ou null se está tudo certo.
export function checkSignupConsent(acceptedTerms: unknown, birthDate: unknown): string | null {
  if (acceptedTerms !== true) return 'Terms not accepted'
  const birth = parseBirthDate(birthDate)
  if (!birth) return 'Invalid birth date'
  const age = ageOn(birth)
  if (age > 120 || age < 0) return 'Invalid birth date'
  if (age < MIN_AGE) return 'Underage'
  return null
}
