import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const QUESTION_ENTRY_MARKER = '__question_mode_entry__';

type SubmissionMode = 'review' | 'question';

interface SubmitBody {
  name?: string;
  url1?: string;
  url2?: string;
  url3?: string;
  submissionMode?: SubmissionMode;
}

interface WaitingRow {
  name: string | null;
  url1: string | null;
  url3: string | null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeQuestion(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeReviewUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const search = parsed.search;
    return `${hostname}${pathname}${search}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

function normalizePrimaryValue(value: string, mode: SubmissionMode): string {
  return mode === 'review' ? normalizeReviewUrl(value) : normalizeQuestion(value);
}

function resolveMode(body: SubmitBody): SubmissionMode {
  if (body.submissionMode === 'review' || body.submissionMode === 'question') {
    return body.submissionMode;
  }

  return body.url3 === QUESTION_ENTRY_MARKER ? 'question' : 'review';
}

function generateShortId(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SubmitBody;
    const mode = resolveMode(body);

    const cleanedName = (body.name ?? '').trim();
    const cleanedPrimary = (body.url1 ?? '').trim();

    if (!cleanedName) {
      return Response.json({ error: 'Please provide your name or handle.' }, { status: 400 });
    }

    if (!cleanedPrimary) {
      return Response.json({ error: mode === 'review' ? 'Please provide a link.' : 'Please provide your question.' }, { status: 400 });
    }

    const normalizedName = normalizeName(cleanedName);
    const normalizedPrimary = normalizePrimaryValue(cleanedPrimary, mode);

    const { data: waitingRows, error: waitingError } = await supabase
      .from('queue')
      .select('name, url1, url3')
      .eq('status', 'waiting');

    if (waitingError) throw waitingError;

    const rows = (waitingRows as WaitingRow[] | null) ?? [];

    for (const row of rows) {
      const rowName = normalizeName(row.name ?? '');
      if (rowName && rowName === normalizedName) {
        return Response.json(
          { error: 'A submission from this name is already in the queue.', code: 'duplicate_name' },
          { status: 409 }
        );
      }

      const rowMode: SubmissionMode = row.url3 === QUESTION_ENTRY_MARKER ? 'question' : 'review';
      if (rowMode !== mode) continue;

      const rowPrimary = normalizePrimaryValue(row.url1 ?? '', rowMode);
      if (rowPrimary && rowPrimary === normalizedPrimary) {
        return Response.json(
          { error: mode === 'review' ? 'This link is already in the queue.' : 'This question is already in the queue.', code: 'duplicate_primary' },
          { status: 409 }
        );
      }
    }

    const shortId = generateShortId();
    const payload = mode === 'question'
      ? {
          name: cleanedName,
          url1: cleanedPrimary,
          url2: '',
          url3: QUESTION_ENTRY_MARKER,
          short_id: shortId,
        }
      : {
          name: cleanedName,
          url1: cleanedPrimary,
          url2: (body.url2 ?? '').trim(),
          url3: (body.url3 ?? '').trim(),
          short_id: shortId,
        };

    const { error: insertError } = await supabase.from('queue').insert([payload]);
    if (insertError) throw insertError;

    return Response.json({ shortId }, { status: 201 });
  } catch (error) {
    console.error('Submit queue entry error:', error);
    return Response.json({ error: 'Unable to submit entry.' }, { status: 500 });
  }
}
