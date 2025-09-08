'use client';

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// README.md의 지침에 따라 .env.local 파일에 실제 값을 설정하세요.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _supabase: SupabaseClient | null = null;
if (typeof window !== 'undefined') {
  // 클라이언트에서만 초기화 (빌드 타임 프리렌더 회피)
  if (supabaseUrl && supabaseKey) {
    _supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
}

export const supabase = _supabase;
