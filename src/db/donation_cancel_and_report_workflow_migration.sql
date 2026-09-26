-- Permite cancelar uma doação/transação (pelo doador, ou automaticamente
-- quando a conta do doador é desativada/suspensa) e guarda o motivo.
-- Os CHECK de status são inline (sem nome definido na criação da tabela),
-- então descobrimos dinamicamente o nome real do constraint de status
-- (filtrando pela definição, não removendo todo CHECK da tabela) antes de
-- trocar, em vez de arriscar o nome padrão gerado pelo Postgres ou apagar
-- de quebra o CHECK de finalized_by que já existe em donation_history.
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
ALTER TABLE public.donations ADD CONSTRAINT donations_status_check CHECK (status IN ('available', 'reserved', 'completed', 'cancelled'));

ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

DO $$
DECLARE con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.donation_history'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.donation_history DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
ALTER TABLE public.donation_history ADD CONSTRAINT donation_history_status_check CHECK (status IN ('accepted_awaiting_shipment', 'shipped', 'finalized_manual', 'finalized_automatic', 'cancelled'));

ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20) CHECK (cancelled_by IN ('donor', 'system'));

-- Comentário de como a denúncia foi resolvida (ação tomada + observação do admin)
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_comment TEXT;

-- Histórico de transferências de denúncia entre administradores
CREATE TABLE IF NOT EXISTS public.report_transfers (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    from_admin_id INTEGER REFERENCES public.admins(id),
    to_admin_id INTEGER NOT NULL REFERENCES public.admins(id),
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
