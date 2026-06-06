CREATE TABLE public.users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(150) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.profiles (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    birth_date DATE,
    phone VARCHAR(20),
    cpf VARCHAR(14),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.donations (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    category VARCHAR(80),
    photo_url TEXT,
    quantity INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.donation_history (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_id INTEGER NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    donor_id INTEGER NOT NULL REFERENCES public.users(id),
    recipient_id INTEGER NOT NULL REFERENCES public.users(id),
    donated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.wishlist (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_id INTEGER NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (donation_id, user_id)
);

CREATE TABLE public.conversations (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_id INTEGER NOT NULL REFERENCES public.donations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.messages (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read BOOLEAN DEFAULT FALSE
);

CREATE TABLE public.notifications (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    reference_id INTEGER,
    reference_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_profiles_user ON public.profiles USING btree (user_id);
CREATE INDEX idx_donations_user ON public.donations USING btree (user_id);
CREATE INDEX idx_donations_status ON public.donations USING btree (status);
CREATE INDEX idx_donation_history ON public.donation_history USING btree (donation_id);
CREATE INDEX idx_wishlist_donation ON public.wishlist USING btree (donation_id);
CREATE INDEX idx_wishlist_user ON public.wishlist USING btree (user_id);
CREATE INDEX idx_conversations_sender ON public.conversations USING btree (sender_id);
CREATE INDEX idx_conversations_recipient ON public.conversations USING btree (recipient_id);
CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);
CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id, read);
