import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TOGGLE_SHORT_ID = '__submissions_toggle__';
const MODE_SHORT_ID = '__submission_mode__';
const TOGGLE_STATUS = '__config__';
const DEFAULT_MODE = 'review';

type SubmissionMode = 'review' | 'question';

interface ToggleRow {
  id: string;
  is_priority: boolean | null;
}

interface ModeRow {
  id: string;
  url1: string | null;
}

async function getToggleRows() {
  const { data, error } = await supabase
    .from('queue')
    .select('id, is_priority')
    .eq('short_id', TOGGLE_SHORT_ID)
    .eq('status', TOGGLE_STATUS)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw error;
  return (data as ToggleRow[] | null) ?? [];
}

async function getModeRows() {
  const { data, error } = await supabase
    .from('queue')
    .select('id, url1')
    .eq('short_id', MODE_SHORT_ID)
    .eq('status', TOGGLE_STATUS)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw error;
  return (data as ModeRow[] | null) ?? [];
}

async function getSubmissionsOpen() {
  const rows = await getToggleRows();
  return rows.length === 0 ? true : (rows[0].is_priority ?? true);
}

async function getSubmissionMode(): Promise<SubmissionMode> {
  const rows = await getModeRows();
  const first = rows[0]?.url1;
  return first === 'question' ? 'question' : DEFAULT_MODE;
}

function isSubmissionMode(value: unknown): value is SubmissionMode {
  return value === 'review' || value === 'question';
}

export async function GET() {
  try {
    const submissionsOpen = await getSubmissionsOpen();
    const submissionMode = await getSubmissionMode();
    return Response.json({ submissionsOpen, submissionMode }, { status: 200 });
  } catch (error) {
    console.error('Get submissions setting error:', error);
    return Response.json({ error: 'Unable to load submission setting.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { password, submissionsOpen, submissionMode } = await req.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return new Response('Unauthorized: Wrong Password', { status: 401 });
    }

    const wantsToggleUpdate = typeof submissionsOpen === 'boolean';
    const wantsModeUpdate = typeof submissionMode !== 'undefined';

    if (!wantsToggleUpdate && !wantsModeUpdate) {
      return Response.json({ error: 'Provide submissionsOpen and/or submissionMode.' }, { status: 400 });
    }

    if (wantsModeUpdate && !isSubmissionMode(submissionMode)) {
      return Response.json({ error: 'submissionMode must be "review" or "question".' }, { status: 400 });
    }

    let nextSubmissionsOpen = await getSubmissionsOpen();
    let nextSubmissionMode = await getSubmissionMode();

    if (wantsToggleUpdate) {
      const existingToggleRows = await getToggleRows();
      const currentValue = existingToggleRows.length === 0 ? true : (existingToggleRows[0].is_priority ?? true);

      if (currentValue !== submissionsOpen) {
        const { error } = existingToggleRows.length > 0
          ? await supabase
              .from('queue')
              .update({ is_priority: submissionsOpen })
              .in('id', existingToggleRows.map((row) => row.id))
          : await supabase.from('queue').insert([
              {
                short_id: TOGGLE_SHORT_ID,
                name: 'SYSTEM_SUBMISSIONS_TOGGLE',
                url1: 'https://stream-queue.local/config',
                is_priority: submissionsOpen,
                status: TOGGLE_STATUS,
              },
            ]);

        if (error) throw error;
      }

      nextSubmissionsOpen = submissionsOpen;
    }

    if (wantsModeUpdate) {
      const existingModeRows = await getModeRows();

      if (nextSubmissionMode !== submissionMode) {
        const { error } = existingModeRows.length > 0
          ? await supabase
              .from('queue')
              .update({ url1: submissionMode })
              .in('id', existingModeRows.map((row) => row.id))
          : await supabase.from('queue').insert([
              {
                short_id: MODE_SHORT_ID,
                name: 'SYSTEM_SUBMISSION_MODE',
                url1: submissionMode,
                is_priority: false,
                status: TOGGLE_STATUS,
              },
            ]);

        if (error) throw error;
      }

      nextSubmissionMode = submissionMode;
    }

    return Response.json({ submissionsOpen: nextSubmissionsOpen, submissionMode: nextSubmissionMode }, { status: 200 });
  } catch (error) {
    console.error('Update submissions setting error:', error);
    return Response.json({ error: 'Unable to update submission setting.' }, { status: 500 });
  }
}
