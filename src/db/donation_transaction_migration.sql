-- Transforma donation_history de um simples log em uma transação com estado:
-- accepted_awaiting_shipment -> shipped -> finalized_manual | finalized_automatic
ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'accepted_awaiting_shipment' CHECK (status IN ('accepted_awaiting_shipment', 'shipped', 'finalized_manual', 'finalized_automatic'));
ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP;
ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS received_at TIMESTAMP;
ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS donor_marked_received_at TIMESTAMP;
ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;
ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS finalized_by VARCHAR(20) CHECK (finalized_by IN ('recipient', 'donor', 'automatic'));
ALTER TABLE public.donation_history ADD COLUMN IF NOT EXISTS auto_finalize_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_donation_history_status ON public.donation_history USING btree (status);

-- Transações que já existiam antes desse fluxo vieram do modelo antigo
-- (aceitar = concluir na hora), então entram como finalizadas manualmente
-- na data em que já haviam sido registradas. Idempotente: só afeta linhas
-- que ainda não foram finalizadas por este script.
UPDATE public.donation_history
SET status = 'finalized_manual', finalized_at = donated_at, finalized_by = 'recipient'
WHERE finalized_at IS NULL;
