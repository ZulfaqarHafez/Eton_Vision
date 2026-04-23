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
  class_group: string;
  confidence: number;
  thumbnail?: string;
}

// Published report stored in Supabase
// Table SQL:
// CREATE TABLE published_reports (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   title text NOT NULL,
//   student_name text NOT NULL,
//   class_group text NOT NULL DEFAULT '',
//   image_url text,
//   context text NOT NULL DEFAULT '',
//   observation text NOT NULL DEFAULT '',
//   learning_analysis jsonb NOT NULL DEFAULT '[]',
//   report_raw text NOT NULL DEFAULT '',
//   created_at timestamptz DEFAULT now()
// );
export interface PublishedReport {
  id: string;
  title: string;
  student_name: string;
  class_group: string;
  image_url: string | null;
  context: string;
  observation: string;
  learning_analysis: { category: string; description: string }[];
  report_raw: string;
  created_at: string;
}

export async function matchFace(
  embedding: number[], 
  classGroup?: string // 👈 1. Add this new parameter
): Promise<FaceMatch | null> {
  
  // 2. Build the parameter object dynamically
  const rpcParams: any = {
    query_embedding: embedding,
    match_threshold: 0.88, // 👈 3. Try bumping this slightly higher to 0.95 for strictness!
  };

  // 4. If a class group is provided, send it to the database
  if (classGroup) {
    rpcParams.class_group = classGroup; 
  }

  // 5. Pass the dynamic params to your RPC
  const { data, error } = await supabase.rpc('match_child_multi', rpcParams);

  if (error) {
    console.error('Match error:', error);
    return null;
  }

  return (data?.[0] as FaceMatch) ?? null;
}

export async function publishReport(report: Omit<PublishedReport, 'id' | 'created_at'>): Promise<PublishedReport | null> {
  const { data, error } = await supabase
    .from('published_reports')
    .insert(report)
    .select()
    .single();

  if (error) {
    console.error('Publish error:', error);
    throw new Error(error.message);
  }

  return data as PublishedReport;
}

export async function uploadReportImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from('report-images')
    .upload(fileName, arrayBuffer, { contentType: file.type });

  if (error) {
    console.error('Image upload error:', error);
    throw new Error('Failed to upload image: ' + error.message);
  }

  const { data } = supabase.storage
    .from('report-images')
    .getPublicUrl(fileName);

  return data.publicUrl;
}

export async function fetchPublishedReports(): Promise<PublishedReport[]> {
  const { data, error } = await supabase
    .from('published_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch reports error:', error);
    return [];
  }

  return (data as PublishedReport[]) ?? [];
}

export async function fetchRecentReportsForStudent(
  studentName: string,
  classGroup?: string,
  limit = 3,
): Promise<PublishedReport[]> {
  const normalizedName = studentName.trim();
  if (!normalizedName) return [];

  const normalizedClass = classGroup?.trim();

  if (normalizedClass) {
    const { data, error } = await supabase
      .from('published_reports')
      .select('*')
      .ilike('student_name', normalizedName)
      .eq('class_group', normalizedClass)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return data as PublishedReport[];
    }

    if (error) {
      console.warn('Fetch recent reports with class group failed, falling back to name-only lookup:', error);
    }
  }

  const { data, error } = await supabase
    .from('published_reports')
    .select('*')
    .ilike('student_name', normalizedName)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Fetch recent reports error:', error);
    return [];
  }

  return (data as PublishedReport[]) ?? [];
}

export async function deletePublishedReport(id: string): Promise<void> {
  const { error } = await supabase
    .from('published_reports')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete report error:', error);
    throw new Error(error.message);
  }
}
