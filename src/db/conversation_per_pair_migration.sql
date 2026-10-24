-- Uma conversa por dupla de usuários, com "assuntos" (uma doação por
-- marcador) e "limpar conversa só para mim".
--
-- Tudo num único bloco DO: roda inteiro ou nada (se algo falhar, o banco
-- fica como estava). Pode rodar de novo sem duplicar nada.
--
-- 1) messages.type ('text' | 'topic') e messages.donation_id (assunto)
-- 2) conversation_hidden.cleared_before_message_id: até onde cada pessoa
--    limpou a conversa (mensagens com id <= esse valor somem só para ela)
-- 3) Marcador de assunto para cada conversa existente e mensagens antigas
--    ligadas à doação da conversa
-- 4) Conversas duplicadas da mesma dupla são unidas na mais antiga
--    (mensagens, denúncias e notificações vão junto ANTES de apagar,
--    porque reports.conversation_id é ON DELETE CASCADE)
-- 5) Índice único: nunca mais duas conversas para a mesma dupla
DO $$
BEGIN
  -- 1) Colunas novas
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'text';
  ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS donation_id INTEGER REFERENCES public.donations(id) ON DELETE SET NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_type_check') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text', 'topic'));
  END IF;

  -- 2) Ponto de limpeza por pessoa
  ALTER TABLE public.conversation_hidden ADD COLUMN IF NOT EXISTS cleared_before_message_id INTEGER;

  -- 3) Marcador de assunto (autor = quem iniciou, data = início da conversa)
  INSERT INTO public.messages (conversation_id, author_id, content, sent_at, type, donation_id)
  SELECT c.id, c.sender_id, d.title, c.created_at, 'topic', c.donation_id
  FROM public.conversations c
  JOIN public.donations d ON d.id = c.donation_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.conversation_id = c.id AND m.type = 'topic' AND m.donation_id = c.donation_id
  );

  UPDATE public.messages m
  SET donation_id = c.donation_id
  FROM public.conversations c
  WHERE m.conversation_id = c.id AND m.type = 'text' AND m.donation_id IS NULL;

  -- 4) Grupos por dupla: a conversa mais antiga (menor id) é a que fica
  CREATE TEMP TABLE conv_groups ON COMMIT DROP AS
  SELECT c.id AS conv_id,
         MIN(c.id) OVER (PARTITION BY LEAST(c.sender_id, c.recipient_id), GREATEST(c.sender_id, c.recipient_id)) AS keeper,
         COUNT(*) OVER (PARTITION BY LEAST(c.sender_id, c.recipient_id), GREATEST(c.sender_id, c.recipient_id)) AS group_size
  FROM public.conversations c;

  -- Quem tinha "excluído" (modelo antigo, sem ponto de limpeza): só continua
  -- oculto se tinha excluído TODAS as conversas da dupla
  CREATE TEMP TABLE hidden_keep ON COMMIT DROP AS
  SELECT h.user_id, g.keeper
  FROM public.conversation_hidden h
  JOIN conv_groups g ON g.conv_id = h.conversation_id
  WHERE h.cleared_before_message_id IS NULL
  GROUP BY h.user_id, g.keeper, g.group_size
  HAVING COUNT(*) = g.group_size;

  DELETE FROM public.conversation_hidden WHERE cleared_before_message_id IS NULL;

  UPDATE public.messages m SET conversation_id = g.keeper
  FROM conv_groups g WHERE m.conversation_id = g.conv_id AND g.conv_id <> g.keeper;

  UPDATE public.reports r SET conversation_id = g.keeper
  FROM conv_groups g WHERE r.conversation_id = g.conv_id AND g.conv_id <> g.keeper;

  UPDATE public.notifications n SET reference_id = g.keeper
  FROM conv_groups g
  WHERE n.reference_type = 'conversation' AND n.reference_id = g.conv_id AND g.conv_id <> g.keeper;

  -- A conversa que fica passa a apontar para o assunto mais recente
  UPDATE public.conversations c
  SET donation_id = latest.donation_id
  FROM (
    SELECT DISTINCT ON (g.keeper) g.keeper, c2.donation_id
    FROM conv_groups g JOIN public.conversations c2 ON c2.id = g.conv_id
    WHERE g.group_size > 1
    ORDER BY g.keeper, c2.id DESC
  ) latest
  WHERE c.id = latest.keeper;

  DELETE FROM public.conversations c
  USING conv_groups g WHERE c.id = g.conv_id AND g.conv_id <> g.keeper;

  -- Excluídas no modelo antigo: limpas até a última mensagem atual
  INSERT INTO public.conversation_hidden (user_id, conversation_id, cleared_before_message_id)
  SELECT k.user_id, k.keeper,
         COALESCE((SELECT MAX(m.id) FROM public.messages m WHERE m.conversation_id = k.keeper), 0)
  FROM hidden_keep k
  ON CONFLICT (user_id, conversation_id) DO NOTHING;

  -- 5) Índices
  CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_unique
    ON public.conversations (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id));
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages (conversation_id, id);
END $$;

-- Conferência: deve voltar 0 linhas (nenhuma dupla com mais de uma conversa)
SELECT LEAST(sender_id, recipient_id) AS usuario_a, GREATEST(sender_id, recipient_id) AS usuario_b, COUNT(*)
FROM public.conversations
GROUP BY 1, 2
HAVING COUNT(*) > 1;
