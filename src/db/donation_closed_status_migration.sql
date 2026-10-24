-- Publicação encerrada pelo próprio dono (antes o "Excluir" apagava a doação
-- do banco, levando junto os favoritos de quem tinha marcado o item).
-- Troca só o CHECK de status de donations, descobrindo o nome real dele.
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
ALTER TABLE public.donations ADD CONSTRAINT donations_status_check CHECK (status IN ('available', 'reserved', 'completed', 'cancelled', 'removed', 'closed'));

ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
