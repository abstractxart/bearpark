-- ============================================
-- 🎭 MEME OF THE WEEK - SIMPLE SETUP
-- ============================================

-- Step 1: Create tables
CREATE TABLE IF NOT EXISTS public.meme_weeks (
    id BIGSERIAL PRIMARY KEY,
    week_start TIMESTAMPTZ NOT NULL,
    week_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.memes (
    id BIGSERIAL PRIMARY KEY,
    week_id BIGINT NOT NULL REFERENCES public.meme_weeks(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    image_url TEXT NOT NULL,
    caption TEXT,
    vote_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(week_id, wallet_address)
);

CREATE TABLE IF NOT EXISTS public.meme_votes (
    id BIGSERIAL PRIMARY KEY,
    meme_id BIGINT NOT NULL REFERENCES public.memes(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    week_id BIGINT NOT NULL REFERENCES public.meme_weeks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(meme_id, wallet_address)
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_memes_week_id ON public.memes(week_id);
CREATE INDEX IF NOT EXISTS idx_memes_wallet ON public.memes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_memes_vote_count ON public.memes(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_meme_votes_meme_id ON public.meme_votes(meme_id);
CREATE INDEX IF NOT EXISTS idx_meme_votes_wallet ON public.meme_votes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_meme_votes_week_id ON public.meme_votes(week_id);

-- Step 3: Enable RLS
ALTER TABLE public.meme_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meme_votes ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop old policies
DROP POLICY IF EXISTS "Everyone can read meme weeks" ON public.meme_weeks;
DROP POLICY IF EXISTS "Everyone can read memes" ON public.memes;
DROP POLICY IF EXISTS "Users can insert own memes" ON public.memes;
DROP POLICY IF EXISTS "Users can update own memes" ON public.memes;
DROP POLICY IF EXISTS "Everyone can read votes" ON public.meme_votes;
DROP POLICY IF EXISTS "Users can insert votes" ON public.meme_votes;

-- Step 5: Create policies
CREATE POLICY "Everyone can read meme weeks"
ON public.meme_weeks FOR SELECT TO public USING (true);

CREATE POLICY "Everyone can read memes"
ON public.memes FOR SELECT TO public USING (true);

CREATE POLICY "Users can insert own memes"
ON public.memes FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Users can update own memes"
ON public.memes FOR UPDATE TO public USING (true);

CREATE POLICY "Everyone can read votes"
ON public.meme_votes FOR SELECT TO public USING (true);

CREATE POLICY "Users can insert votes"
ON public.meme_votes FOR INSERT TO public WITH CHECK (true);

-- Step 6: Create helper functions
CREATE OR REPLACE FUNCTION public.increment_meme_votes(meme_id BIGINT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.memes
    SET vote_count = vote_count + 1
    WHERE id = meme_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_initial_meme_week()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    week_start TIMESTAMPTZ;
    week_end TIMESTAMPTZ;
BEGIN
    week_start := DATE_TRUNC('week', NOW());
    week_end := week_start + INTERVAL '6 days 23 hours 59 minutes 59 seconds';

    INSERT INTO public.meme_weeks (week_start, week_end)
    SELECT week_start, week_end
    WHERE NOT EXISTS (SELECT 1 FROM public.meme_weeks);
END;
$$;

-- Step 7: Initialize first week
SELECT public.create_initial_meme_week();

-- Step 8: Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'bearpark-memes',
    'bearpark-memes',
    true,
    52428800,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'];

-- Step 9: Storage policies
DROP POLICY IF EXISTS "Public read access for memes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload memes" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own memes" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own memes" ON storage.objects;

CREATE POLICY "Public read access for memes"
ON storage.objects FOR SELECT TO public USING (bucket_id = 'bearpark-memes');

CREATE POLICY "Authenticated users can upload memes"
ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'bearpark-memes');

CREATE POLICY "Users can update own memes"
ON storage.objects FOR UPDATE TO public USING (bucket_id = 'bearpark-memes');

CREATE POLICY "Users can delete own memes"
ON storage.objects FOR DELETE TO public USING (bucket_id = 'bearpark-memes');
