-- Reserva "leve": o doador escolhe um interessado pra segurar o item por até
-- 3 dias, sem ainda criar uma transação de envio (isso só acontece quando
-- ele de fato "doa"/confirma pra alguém, via donation_history). Pode ser
-- desfeita a qualquer momento (reserved_for_user_id volta a NULL) e expira
-- sozinha (ver releaseExpiredReservations em donationsController.ts).
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS reserved_for_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_donations_reserved_until ON public.donations USING btree (reserved_until);
