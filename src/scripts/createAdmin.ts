import bcrypt from 'bcrypt'

// Uso: npx ts-node src/scripts/createAdmin.ts "email@exemplo.com" "senha" "Nome do Admin"
// Gera o comando INSERT pronto para rodar no SQL Editor do Supabase.
// Não escreve no banco diretamente — este script não tem acesso a credenciais de produção.

async function main() {
  const [email, password, fullName] = process.argv.slice(2)

  if (!email || !password || !fullName) {
    console.error('Uso: npx ts-node src/scripts/createAdmin.ts "email@exemplo.com" "senha" "Nome do Admin"')
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  const escapedEmail = email.replace(/'/g, "''")
  const escapedName = fullName.replace(/'/g, "''")

  console.log('\nRode este comando no SQL Editor do Supabase:\n')
  console.log(
    `INSERT INTO public.admins (email, password, full_name) VALUES ('${escapedEmail}', '${hash}', '${escapedName}');`
  )
}

main()
