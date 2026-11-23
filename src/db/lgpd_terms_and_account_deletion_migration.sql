-- LGPD: registro do aceite dos termos e exclusão da própria conta.
--
-- Tudo num único bloco DO: roda inteiro ou nada. Pode rodar de novo sem
-- duplicar nada.
--
-- 1) users.terms_accepted_at / users.terms_version: quando e qual versão dos
--    Termos de Uso e da Política de Privacidade a pessoa aceitou (prova do
--    aceite, art. 8º §2º da LGPD). Contas antigas ficam NULL e o app pede o
--    aceite no próximo acesso.
-- 2) donation_history.donor_id / recipient_id passam a aceitar NULL e a ficar
--    NULL quando o usuário é excluído (ON DELETE SET NULL). Antes a chave
--    estrangeira impedia apagar qualquer usuário com histórico de doação,
--    inclusive na limpeza automática das contas desativadas há 30 dias.
--    A outra pessoa continua vendo o histórico, como "Usuário excluído".
DO $$
DECLARE
  fk RECORD;
BEGIN
  -- 1) Aceite dos termos
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;
  ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);

  -- 2) Histórico de doação sobrevive à exclusão de um dos lados
  ALTER TABLE public.donation_history ALTER COLUMN donor_id DROP NOT NULL;
  ALTER TABLE public.donation_history ALTER COLUMN recipient_id DROP NOT NULL;

  -- Remove as chaves estrangeiras atuais dessas colunas para users (o nome
  -- pode variar entre bancos, então procura pela definição)
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.donation_history'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND c.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.donation_history DROP CONSTRAINT %I', fk.conname);
  END LOOP;

  ALTER TABLE public.donation_history
    ADD CONSTRAINT donation_history_donor_id_fkey
    FOREIGN KEY (donor_id) REFERENCES public.users(id) ON DELETE SET NULL;
  ALTER TABLE public.donation_history
    ADD CONSTRAINT donation_history_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE SET NULL;
END $$;

-- Conferência: as duas linhas devem mostrar confdeltype = 'n' (SET NULL)
SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid = 'public.donation_history'::regclass AND contype = 'f'
  AND confrelid = 'public.users'::regclass;
