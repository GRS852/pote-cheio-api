CREATE TABLE public.admins (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(150) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.reports (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reporter_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('donation', 'conversation')),
    donation_id INTEGER REFERENCES public.donations(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES public.conversations(id) ON DELETE CASCADE,
    reported_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('scam', 'inappropriate_content', 'harassment', 'spam')),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by INTEGER REFERENCES public.admins(id) ON DELETE SET NULL,
    CHECK (
        (target_type = 'donation' AND donation_id IS NOT NULL AND conversation_id IS NULL) OR
        (target_type = 'conversation' AND conversation_id IS NOT NULL AND donation_id IS NULL)
    )
);

CREATE INDEX idx_reports_status ON public.reports USING btree (status);
CREATE INDEX idx_reports_reporter ON public.reports USING btree (reporter_id);
CREATE INDEX idx_reports_reported_user ON public.reports USING btree (reported_user_id);
