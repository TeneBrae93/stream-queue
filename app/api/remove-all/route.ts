import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return new Response('Unauthorized: Wrong Password', { status: 401 });
    }

    // Clear only active queue entries.
    const { error } = await supabase
      .from('queue')
      .delete()
      .eq('status', 'waiting');

    if (error) throw error;

    return new Response('Queue cleared successfully', { status: 200 });
  } catch (error) {
    console.error('Clear Queue Error:', error);
    return new Response('Error processing request', { status: 500 });
  }
}
