-- Login com Google: quem entra pelo Google não tem senha, e a conta guarda o
-- identificador do Google (campo "sub" do ID Token) para os próximos logins.
-- Pode rodar mais de uma vez sem problema. Rode com Alt+X (script inteiro).
ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON public.users (google_id) WHERE google_id IS NOT NULL;

-- Conferência: deve voltar 1 linha com is_nullable = YES e 1 linha google_id
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('password', 'google_id')
ORDER BY column_name;
