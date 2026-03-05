import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { id, password } = await req.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return new Response('Unauthorized: Wrong Password', { status: 401 });
    }

    const { error } = await supabase
      .from('queue')
      .update({ is_priority: true })
      .eq('id', id)
      .eq('status', 'waiting');

    if (error) throw error;

    return new Response('Successfully set priority', { status: 200 });
  } catch (error) {
    console.error('Priority Update Error:', error);
    return new Response('Error processing request', { status: 500 });
  }
}
