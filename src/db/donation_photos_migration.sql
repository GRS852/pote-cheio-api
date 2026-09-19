CREATE TABLE IF NOT EXISTS public.donation_photos (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_id INTEGER NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    position SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_donation_photos_donation ON public.donation_photos USING btree (donation_id);

-- Migra a foto única já existente em donations.photo_url para a posição 0
-- da nova tabela. Idempotente: só insere para doações que ainda não têm
-- nenhuma linha em donation_photos, então pode ser rodado mais de uma vez.
INSERT INTO public.donation_photos (donation_id, photo_url, position)
SELECT d.id, d.photo_url, 0
FROM public.donations d
WHERE d.photo_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.donation_photos dp WHERE dp.donation_id = d.id);
