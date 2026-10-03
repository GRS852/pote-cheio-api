-- Permite ao admin remover só a publicação (sem punir a conta) e registrar
-- essa ação no histórico de moderação do usuário.
-- Os CHECK de status/action_type são inline (sem nome fixo), então o nome
-- real é descoberto dinamicamente e só o CHECK da coluna certa é trocado.
DO $$
DECLARE con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.donations'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.donations DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
ALTER TABLE public.donations ADD CONSTRAINT donations_status_check CHECK (status IN ('available', 'reserved', 'completed', 'cancelled', 'removed'));

ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS removed_reason TEXT;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS removed_at TIMESTAMP;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS removed_by_admin_id INTEGER REFERENCES public.admins(id) ON DELETE SET NULL;

DO $$
DECLARE con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.moderation_actions'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%action_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.moderation_actions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
ALTER TABLE public.moderation_actions ADD CONSTRAINT moderation_actions_action_type_check CHECK (action_type IN ('warning', 'disable_account', 'reactivate_account', 'remove_post'));

ALTER TABLE public.moderation_actions ADD COLUMN IF NOT EXISTS donation_id INTEGER REFERENCES public.donations(id) ON DELETE SET NULL;
