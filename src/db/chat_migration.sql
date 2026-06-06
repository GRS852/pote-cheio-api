CREATE TABLE public.conversas (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doacao_id INTEGER NOT NULL,
    usuario_remetente_id INTEGER NOT NULL REFERENCES public.usuarios_login(id) ON DELETE CASCADE,
    usuario_destinatario_id INTEGER NOT NULL REFERENCES public.usuarios_login(id) ON DELETE CASCADE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.mensagens (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversa_id INTEGER NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
    autor_id INTEGER NOT NULL REFERENCES public.usuarios_login(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    enviado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lido BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_mensagens_conversa ON public.mensagens USING btree (conversa_id);
CREATE INDEX idx_conversas_remetente ON public.conversas USING btree (usuario_remetente_id);
CREATE INDEX idx_conversas_destinatario ON public.conversas USING btree (usuario_destinatario_id);
