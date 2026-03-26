"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image'; // <-- NEW: Imported Next.js Image component

type SubmissionMode = 'review' | 'question';
const QUESTION_ENTRY_MARKER = '__question_mode_entry__';

interface QueueItem {
  id: string;
  name: string;
  url1: string;
  url2?: string;
  url3?: string;
  is_priority: boolean;
  short_id: string;
}

interface FormData {
  name: string;
  url1: string;
  url2: string;
  url3: string;
  question: string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const ASSIGNED_CODE_STORAGE_KEY = 'stream_queue_assigned_code';

export default function Home() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [formData, setFormData] = useState<FormData>({ name: '', url1: '', url2: '', url3: '', question: '' });
  const [assignedCode, setAssignedCode] = useState<string | null>(null);
  const [submissionsOpen, setSubmissionsOpen] = useState(true);
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>('review');
  
  // New Admin State
  const [adminPassword, setAdminPassword] = useState<string | null>(null);

  useEffect(() => {
    const savedCode = window.localStorage.getItem(ASSIGNED_CODE_STORAGE_KEY);
    if (savedCode) {
      setAssignedCode(savedCode);
    }

    fetchQueue();
    fetchSubmissionSetting();
    const channel = supabase.channel('public:queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => {
        fetchQueue();
        fetchSubmissionSetting();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (assignedCode) {
      window.localStorage.setItem(ASSIGNED_CODE_STORAGE_KEY, assignedCode);
      return;
    }

    window.localStorage.removeItem(ASSIGNED_CODE_STORAGE_KEY);
  }, [assignedCode]);

  const fetchQueue = async () => {
    const { data } = await supabase
      .from('queue')
      .select('*')
      .eq('status', 'waiting')
      .order('is_priority', { ascending: false })
      .order('created_at', { ascending: true });
    if (data) setQueue(data as QueueItem[]);
  };

  const fetchSubmissionSetting = async () => {
    try {
      const res = await fetch('/api/submissions');
      if (!res.ok) throw new Error('Failed to load submission setting');
      const data: { submissionsOpen: boolean; submissionMode?: SubmissionMode } = await res.json();
      setSubmissionsOpen(data.submissionsOpen);
      setSubmissionMode(data.submissionMode === 'question' ? 'question' : 'review');
    } catch {
      setSubmissionsOpen(true);
      setSubmissionMode('review');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!submissionsOpen) {
      alert('Submissions are currently closed.');
      return;
    }

    const cleanedName = formData.name.trim();
    if (!cleanedName) {
      alert('Please enter your name or handle.');
      return;
    }

    if (submissionMode === 'review' && !formData.url1.trim()) {
      alert('Please add at least one link.');
      return;
    }

    if (submissionMode === 'question' && !formData.question.trim()) {
      alert('Please enter your question.');
      return;
    }

    const payload = submissionMode === 'question'
      ? {
          name: cleanedName,
          url1: formData.question.trim(),
          url2: '',
          url3: QUESTION_ENTRY_MARKER,
          submissionMode,
        }
      : {
          name: cleanedName,
          url1: formData.url1.trim(),
          url2: formData.url2.trim(),
          url3: formData.url3.trim(),
          submissionMode,
        };

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseBody = await res.json().catch(() => ({}));

    if (res.status === 409) {
      alert(responseBody.error ?? 'This submission is already in the queue.');
      return;
    }

    if (!res.ok) {
      alert(responseBody.error ?? 'Something went wrong submitting your entry.');
      return;
    }

    setAssignedCode(responseBody.shortId ?? null);
    setFormData({ name: '', url1: '', url2: '', url3: '', question: '' });
  };

  // --- NEW: Handle Admin Unlock ---
  const handleAdminUnlock = () => {
    const pass = prompt("Enter Admin Password:");
    if (pass) setAdminPassword(pass);
  };

  // --- NEW: Handle Deletion ---
  const handleRemove = async (id: string) => {
    if (!adminPassword) return;

    const res = await fetch('/api/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password: adminPassword })
    });

    if (res.status === 401) {
      alert("Wrong password!");
      setAdminPassword(null); // Kick them out of admin mode
    } else if (!res.ok) {
      alert("Something went wrong removing the user.");
    }
    // If successful, the Supabase real-time subscription will automatically remove them from the screen!
  };
  const handleSetPriority = async (id: string) => {
    if (!adminPassword) return;

    const res = await fetch('/api/priority', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password: adminPassword })
    });

    if (res.status === 401) {
      alert("Wrong password!");
      setAdminPassword(null); // Kick them out of admin mode
    } else if (!res.ok) {
      alert("Something went wrong setting priority.");
    }
    // If successful, the realtime subscription will re-order the queue automatically.
  };

  const handleClearAll = async () => {
    if (!adminPassword) return;

    const confirmed = window.confirm('Clear all waiting users from the queue?');
    if (!confirmed) return;

    const res = await fetch('/api/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword })
    });

    if (res.status === 401) {
      alert('Wrong password!');
      setAdminPassword(null);
    } else if (!res.ok) {
      alert('Something went wrong clearing the queue.');
    }
  };

  const handleToggleSubmissions = async () => {
    if (!adminPassword) return;

    const nextState = !submissionsOpen;
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, submissionsOpen: nextState }),
    });

    if (res.status === 401) {
      alert('Wrong password!');
      setAdminPassword(null);
      return;
    }

    if (!res.ok) {
      alert('Unable to update submission status.');
      return;
    }

    setSubmissionsOpen(nextState);
  };

  const handleToggleSubmissionMode = async () => {
    if (!adminPassword) return;

    const nextMode: SubmissionMode = submissionMode === 'review' ? 'question' : 'review';
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, submissionMode: nextMode }),
    });

    if (res.status === 401) {
      alert('Wrong password!');
      setAdminPassword(null);
      return;
    }

    if (!res.ok) {
      alert('Unable to update submission mode.');
      return;
    }

    setSubmissionMode(nextMode);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10 font-sans flex flex-col justify-between">
      
      {/* --- NEW: Header Section --- */}
      <div className="max-w-4xl mx-auto w-full flex flex-col items-center mb-10 text-center">
        <Image
          src="/logo.png" 
          alt="Hack Smarter Logo"
          width={250} 
          height={60}
          className="mb-4"
        />
        <p className="text-lg text-gray-300">
          While you wait for the review, go hack some labs at{' '}
          <a 
            href="https://hacksmarter.org" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-400 hover:underline transition-colors font-semibold"
          >
            hacksmarter.org
          </a>!
        </p>
      </div>
      {/* -------------------------- */}

      <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-10">
        
        {/* Submission Form */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg h-fit">
          <h2 className="text-2xl font-bold mb-4">Submit</h2>
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-4">
            Current mode: <span className="font-semibold text-white">{submissionMode === 'review' ? 'Review Mode' : 'Question Mode'}</span>
          </p>
          {assignedCode ? (
            <div className="bg-green-600/20 border border-green-500 p-4 rounded text-center">
              <h3 className="text-xl font-bold text-green-400">You are in the queue!</h3>
              <p className="mt-2 text-gray-300">To jump ahead, donate at <strong>ko-fi.com/tylerramsbey</strong> and include this exact code in your message:</p>
              <p className="text-4xl font-black text-white my-4 tracking-widest">{assignedCode}</p>
              <button onClick={() => setAssignedCode(null)} className="text-sm underline text-gray-400 hover:text-white mt-2">Submit another</button>
            </div>
          ) : !submissionsOpen ? (
            <div className="rounded border border-amber-500/70 bg-amber-500/10 p-4 text-amber-200">
              <h3 className="text-lg font-bold text-amber-300">Submissions are currently closed</h3>
              <p className="mt-2 text-sm">Additional submissions are currently not being accepted.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input required placeholder="Your Name / Handle" className="p-2 bg-gray-700 rounded text-white" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              {submissionMode === 'review' ? (
                <>
                  <input required placeholder="URL 1 (LinkedIn, GitHub, etc)" className="p-2 bg-gray-700 rounded text-white" value={formData.url1} onChange={e => setFormData({...formData, url1: e.target.value})} />
                  <input placeholder="URL 2 (Optional)" className="p-2 bg-gray-700 rounded text-white" value={formData.url2} onChange={e => setFormData({...formData, url2: e.target.value})} />
                  <input placeholder="URL 3 (Optional)" className="p-2 bg-gray-700 rounded text-white" value={formData.url3} onChange={e => setFormData({...formData, url3: e.target.value})} />
                </>
              ) : (
                <textarea
                  required
                  placeholder="Your question"
                  className="p-2 bg-gray-700 rounded text-white min-h-28"
                  value={formData.question}
                  onChange={e => setFormData({...formData, question: e.target.value})}
                />
              )}
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 font-bold p-3 rounded transition mt-2">Join Queue</button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* Admin Controls */}
          {adminPassword && (
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500/40 h-fit">
              <h3 className="text-base font-bold uppercase tracking-wide text-red-300">Admin Controls</h3>
              <p className="text-sm text-gray-300 mt-1">Manage queue actions and future admin settings.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleToggleSubmissionMode}
                  className="text-xs font-bold px-3 py-1 rounded border transition bg-cyan-500/20 text-cyan-300 border-cyan-500 hover:bg-cyan-500/30"
                >
                  {submissionMode === 'review' ? 'Switch To Question Mode' : 'Switch To Review Mode'}
                </button>
                <button
                  onClick={handleToggleSubmissions}
                  className={`text-xs font-bold px-3 py-1 rounded border transition ${submissionsOpen ? 'bg-amber-500/20 text-amber-300 border-amber-500 hover:bg-amber-500/30' : 'bg-green-500/20 text-green-300 border-green-500 hover:bg-green-500/30'}`}
                >
                  {submissionsOpen ? 'Close Submissions' : 'Open Submissions'}
                </button>
                <button
                  onClick={handleClearAll}
                  className="text-xs font-bold px-3 py-1 rounded border transition bg-red-500/20 text-red-300 border-red-500 hover:bg-red-500/30"
                  title="Remove all waiting users from the queue"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}

          {/* The Live Queue */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg h-fit">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Live Queue ({queue.length})</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-700 text-gray-200 px-2 py-1 rounded border border-gray-600">
                  Total in list: {queue.length}
                </span>
                {adminPassword && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500">Admin Mode Active</span>}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {queue.length === 0 && <p className="text-gray-400 italic">Queue is empty. Be the first!</p>}
              {queue.map((user, index) => (
                (() => {
                  const isQuestionEntry = user.url3 === QUESTION_ENTRY_MARKER;
                  return (
                <div key={user.id} className={`p-4 rounded border flex items-stretch ${user.is_priority ? 'bg-yellow-500/10 border-yellow-500' : 'bg-gray-700 border-gray-600'}`}>

                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg">#{index + 1} - {user.name}</span>
                      <div className="flex items-center gap-2">
                        {!user.is_priority && assignedCode === user.short_id && (
                          <button
                            onClick={() => setAssignedCode(user.short_id)}
                            className="text-xs font-bold px-2 py-1 rounded border border-green-500 text-green-300 hover:bg-green-500/20 transition"
                            title="Show donation info again"
                          >
                            Prioritize
                          </button>
                        )}
                        {user.is_priority && <span className="text-xs bg-yellow-500 text-black px-2 py-1 font-black rounded uppercase tracking-wider">Priority</span>}
                      </div>
                    </div>
                    {isQuestionEntry ? (
                      <div className="text-sm text-gray-100 mt-2 whitespace-pre-wrap break-words">{user.url1}</div>
                    ) : (
                      <div className="text-sm text-blue-400 mt-2 flex flex-col gap-1 overflow-hidden">
                        <a href={user.url1} target="_blank" rel="noreferrer" className="truncate hover:underline">{user.url1}</a>
                        {user.url2 && <a href={user.url2} target="_blank" rel="noreferrer" className="truncate hover:underline">{user.url2}</a>}
                        {user.url3 && <a href={user.url3} target="_blank" rel="noreferrer" className="truncate hover:underline">{user.url3}</a>}
                      </div>
                    )}
                  </div>

                  {/* Admin Remove Button */}
                  {adminPassword && (
                    <div className="ml-3 flex w-24 flex-shrink-0 items-center border-l border-gray-600 pl-3">
                      <div className="flex w-full flex-col gap-2">
                        {!user.is_priority && (
                          <button
                            onClick={() => handleSetPriority(user.id)}
                            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2 px-3 rounded transition"
                            title="Manually set this user to priority"
                          >
                            Priority
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(user.id)}
                          className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-3 rounded transition"
                          title="Remove from queue"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  )}

                </div>
                  );
                })()
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer & Secret Admin Toggle */}
      <div className="max-w-4xl mx-auto w-full mt-10 text-center flex flex-col items-center gap-2">
        <p className="text-gray-400 text-sm">
          Created by <a href="https://youtube.com/@TylerRamsbey" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline font-semibold transition">Tyler Ramsbey</a>. Open-source and free to use.
        </p>
        <button onClick={handleAdminUnlock} className="text-gray-800 hover:text-gray-600 text-xs transition mt-4">
          Admin Login
        </button>
      </div>
    </div>
  );
}
