import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Child {
  id: string;
  name: string;
  class_group: string;
  consent_given?: boolean;
  created_at?: string;
}

export interface FaceSignature {
  id: string;
  child_id: string;
  embedding: number[];
  image_url: string;
  angle_label: string;
  created_at?: string;
}

export interface FaceMatch {
  child_id: string;
  name: string;
  similarity: number;
}

export interface TaggedChild {
  id: string;
  name: string;
  confidence: number;
  thumbnail?: string;
}

export async function matchFace(embedding: number[]): Promise<FaceMatch | null> {
  const { data, error } = await supabase.rpc('match_child_multi', {
    query_embedding: embedding,
    match_threshold: 0.93,
  });

  if (error) {
    console.error('Match error:', error);
    return null;
  }

  return (data?.[0] as FaceMatch) ?? null;
}
