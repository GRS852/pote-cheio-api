-- Avaliação (0 a 5 estrelas, em passos de meia estrela) e comentário (nota +
-- até 3 fotos) que o beneficiário pode deixar sobre uma doação já finalizada.
-- São ações independentes: uma transação pode ter avaliação sem comentário,
-- comentário sem avaliação, os dois, ou nenhum.
CREATE TABLE IF NOT EXISTS public.donation_ratings (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_history_id INTEGER NOT NULL UNIQUE REFERENCES public.donation_history(id) ON DELETE CASCADE,
    donation_id INTEGER NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    donor_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rating NUMERIC(2,1) NOT NULL CHECK (rating >= 0 AND rating <= 5 AND MOD(rating * 10, 5) = 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_donation_ratings_donor ON public.donation_ratings USING btree (donor_id);

CREATE TABLE IF NOT EXISTS public.donation_comments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_history_id INTEGER NOT NULL UNIQUE REFERENCES public.donation_history(id) ON DELETE CASCADE,
    donation_id INTEGER NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    donor_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_donation_comments_donor ON public.donation_comments USING btree (donor_id);

CREATE TABLE IF NOT EXISTS public.donation_comment_photos (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES public.donation_comments(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    position SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_donation_comment_photos_comment ON public.donation_comment_photos USING btree (comment_id);
