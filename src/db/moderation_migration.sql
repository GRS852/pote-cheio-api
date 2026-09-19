-- Status da conta e banimento temporário
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP;

-- Trava de job: qual admin está com a denúncia "em análise"
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS assigned_admin_id INTEGER REFERENCES public.admins(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reports_assigned_admin ON public.reports USING btree (assigned_admin_id);

-- Histórico de ações de moderação (advertência, desativação, reativação)
-- warning_count do usuário é sempre calculado a partir daqui (COUNT de action_type='warning'),
-- nunca guardado como contador separado, pra não correr risco de ficar dessincronizado.
CREATE TABLE IF NOT EXISTS public.moderation_actions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    admin_id INTEGER NOT NULL REFERENCES public.admins(id),
    report_id INTEGER REFERENCES public.reports(id) ON DELETE SET NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('warning', 'disable_account', 'reactivate_account')),
    ban_days INTEGER,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_user ON public.moderation_actions USING btree (user_id);
