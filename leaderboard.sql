-- =============================================================
-- TFA SPORTS - Global Leaderboard Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================
--
-- SETUP:
-- 1. Create a free Supabase project at https://supabase.com
-- 2. Paste this entire file into Dashboard > SQL Editor > New Query
-- 3. IMPORTANT: Change the HMAC secret below to your own random string
-- 4. Click "Run" to execute
-- 5. Copy your Project URL + anon key from Dashboard > Settings > API
-- 6. Set them in game.js: Leaderboard.SUPABASE_URL and Leaderboard.SUPABASE_ANON
-- 7. Make sure Leaderboard.HMAC_SALT in game.js matches the secret below

-- Enable pgcrypto for HMAC verification
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ================================================================
-- LEADERBOARD TABLE
-- Stores per-event scores and grand scores in one table
-- ================================================================
CREATE TABLE public.leaderboard (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_name TEXT        NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 12),
    event_id    TEXT        NOT NULL CHECK (event_id IN ('ladder', 'boot', 'rockSkip', 'soccer', 'bottleThrow', 'grand')),
    score       NUMERIC     NOT NULL,
    event_count SMALLINT    DEFAULT NULL,  -- only used for grand scores
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leaderboard_event_score ON public.leaderboard (event_id, score DESC);

-- RLS: public read, deny all writes (only via submit_score function)
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaderboard_select" ON public.leaderboard
    FOR SELECT USING (true);

CREATE POLICY "leaderboard_insert_deny" ON public.leaderboard
    FOR INSERT WITH CHECK (false);

CREATE POLICY "leaderboard_update_deny" ON public.leaderboard
    FOR UPDATE USING (false);

CREATE POLICY "leaderboard_delete_deny" ON public.leaderboard
    FOR DELETE USING (false);

-- ================================================================
-- SCORE BOUNDS TABLE
-- Server-side plausibility limits (1.2x theoretical max per event)
-- ================================================================
CREATE TABLE public.score_bounds (
    event_id  TEXT PRIMARY KEY,
    max_score NUMERIC NOT NULL
);

INSERT INTO public.score_bounds (event_id, max_score) VALUES
    ('ladder',      36),    -- 30 * 1.2
    ('boot',        660),   -- 400 * 1.2 + headroom for seagull bonus (3 x 25 = 75)
    ('rockSkip',    330),   -- 275 * 1.2
    ('soccer',      540),   -- 450 * 1.2
    ('bottleThrow', 1080),  -- 900 * 1.2
    ('grand',       600);   -- 5 events * 100 * 1.2

ALTER TABLE public.score_bounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "score_bounds_select" ON public.score_bounds FOR SELECT USING (true);

-- ================================================================
-- SUBMISSION LOG (rate limiting)
-- ================================================================
CREATE TABLE public.submission_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id  TEXT        NOT NULL,
    event_id   TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_submission_log_recent
    ON public.submission_log (client_id, event_id, created_at DESC);

ALTER TABLE public.submission_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submission_log_deny" ON public.submission_log FOR ALL USING (false);

-- ================================================================
-- PRIVATE CONFIG (HMAC secret - inaccessible via REST API)
-- ================================================================
CREATE TABLE public.private_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

ALTER TABLE public.private_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "private_config_deny" ON public.private_config FOR ALL USING (false);

-- *** CHANGE THIS to your own random string! Must match Leaderboard.HMAC_SALT in game.js ***
INSERT INTO public.private_config (key, value)
    VALUES ('hmac_secret', 'tfa-sports-2024-change-me-to-a-random-string');

-- ================================================================
-- SUBMIT SCORE FUNCTION (SECURITY DEFINER - bypasses RLS)
-- Called via: supabase.rpc('submit_score', { ... })
-- ================================================================
CREATE OR REPLACE FUNCTION public.submit_score(
    p_player_name TEXT,
    p_event_id    TEXT,
    p_score       NUMERIC,
    p_event_count SMALLINT DEFAULT NULL,
    p_timestamp   BIGINT   DEFAULT 0,
    p_checksum    TEXT     DEFAULT '',
    p_client_id   TEXT     DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_secret    TEXT;
    v_max_score NUMERIC;
    v_expected  TEXT;
    v_message   TEXT;
    v_now_ms    BIGINT;
    v_last_sub  TIMESTAMPTZ;
BEGIN
    -- 1. Validate event_id
    IF p_event_id NOT IN ('ladder', 'boot', 'rockSkip', 'soccer', 'bottleThrow', 'grand') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid event');
    END IF;

    -- 2. Validate player_name
    IF char_length(p_player_name) < 1 OR char_length(p_player_name) > 12 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid name');
    END IF;

    -- 3. Score bounds
    SELECT max_score INTO v_max_score FROM public.score_bounds WHERE event_id = p_event_id;
    IF v_max_score IS NULL OR p_score < 0 OR p_score > v_max_score THEN
        RETURN jsonb_build_object('ok', false, 'error', 'score out of bounds');
    END IF;

    -- 4. Timestamp freshness (within 5 minutes)
    v_now_ms := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
    IF abs(v_now_ms - p_timestamp) > 300000 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'stale timestamp');
    END IF;

    -- 5. HMAC verification
    SELECT value INTO v_secret FROM public.private_config WHERE key = 'hmac_secret';
    IF v_secret IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'server config missing');
    END IF;

    v_message := p_player_name || ':' || p_event_id || ':' || p_score::TEXT || ':' || p_timestamp::TEXT;
    v_expected := encode(hmac(v_message::bytea, v_secret::bytea, 'sha256'::text), 'hex');

    IF p_checksum <> v_expected THEN
        RETURN jsonb_build_object('ok', false, 'error', 'checksum mismatch');
    END IF;

    -- 6. Rate limit (1 per event per client per 10 seconds)
    IF p_client_id <> '' THEN
        SELECT created_at INTO v_last_sub
        FROM public.submission_log
        WHERE client_id = p_client_id AND event_id = p_event_id
        ORDER BY created_at DESC LIMIT 1;

        IF v_last_sub IS NOT NULL AND (now() - v_last_sub) < INTERVAL '10 seconds' THEN
            RETURN jsonb_build_object('ok', false, 'error', 'rate limited');
        END IF;

        INSERT INTO public.submission_log (client_id, event_id) VALUES (p_client_id, p_event_id);
    END IF;

    -- 7. Insert the score
    INSERT INTO public.leaderboard (player_name, event_id, score, event_count)
    VALUES (p_player_name, p_event_id, p_score, p_event_count);

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grant execute to anonymous and authenticated roles
GRANT EXECUTE ON FUNCTION public.submit_score TO anon;
GRANT EXECUTE ON FUNCTION public.submit_score TO authenticated;

-- ================================================================
-- OPTIONAL: Periodic cleanup of submission_log
-- Run manually or via pg_cron if available on your tier:
--   DELETE FROM public.submission_log WHERE created_at < now() - INTERVAL '1 hour';
-- ================================================================
