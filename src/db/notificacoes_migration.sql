CREATE TABLE public.notificacoes (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES public.usuarios_login(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    mensagem TEXT NOT NULL,
    lido BOOLEAN DEFAULT FALSE,
    referencia_id INTEGER,
    referencia_tipo VARCHAR(50),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notificacoes_usuario ON public.notificacoes USING btree (usuario_id);
CREATE INDEX idx_notificacoes_lido ON public.notificacoes USING btree (usuario_id, lido);
