-- Permite denunciar um comentário (avaliação/comentário que um beneficiário
-- deixou no perfil de um doador), além de publicação e conversa.
-- Os CHECKs originais da tabela reports não têm nome fixo (foram declarados
-- inline no CREATE TABLE), então em vez de arriscar o nome padrão gerado
-- pelo Postgres, este script descobre e remove dinamicamente todos os
-- CHECK constraints da tabela antes de recriá-los já incluindo 'comment'.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.reports'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS comment_id INTEGER REFERENCES public.donation_comments(id) ON DELETE CASCADE;

ALTER TABLE public.reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('donation', 'conversation', 'comment'));
ALTER TABLE public.reports ADD CONSTRAINT reports_reason_check CHECK (reason IN ('scam', 'inappropriate_content', 'harassment', 'spam'));
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed'));
ALTER TABLE public.reports ADD CONSTRAINT reports_target_consistency_check CHECK (
    (target_type = 'donation' AND donation_id IS NOT NULL AND conversation_id IS NULL AND comment_id IS NULL) OR
    (target_type = 'conversation' AND conversation_id IS NOT NULL AND donation_id IS NULL AND comment_id IS NULL) OR
    (target_type = 'comment' AND comment_id IS NOT NULL AND donation_id IS NULL AND conversation_id IS NULL)
);
