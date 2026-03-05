"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image'; // <-- NEW: Imported Next.js Image component

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
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [formData, setFormData] = useState<FormData>({ name: '', url1: '', url2: '', url3: '' });
  const [assignedCode, setAssignedCode] = useState<string | null>(null);
  
  // New Admin State
  const [adminPassword, setAdminPassword] = useState<string | null>(null);

  useEffect(() => {
    fetchQueue();
    const channel = supabase.channel('public:queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, fetchQueue)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchQueue = async () => {
    const { data } = await supabase
      .from('queue')
      .select('*')
      .eq('status', 'waiting')
      .order('is_priority', { ascending: false })
      .order('created_at', { ascending: true });
    if (data) setQueue(data as QueueItem[]);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const shortId = Math.floor(1000 + Math.random() * 9000).toString();
    
    const { error } = await supabase.from('queue').insert([{ 
      name: formData.name, 
      url1: formData.url1, 
      url2: formData.url2, 
      url3: formData.url3, 
      short_id: shortId 
    }]);

    if (!error) {
      setAssignedCode(shortId);
      setFormData({ name: '', url1: '', url2: '', url3: '' });
    }
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

  const handleClearAll = async () => {
    if (!adminPassword) return;

    const confirmed = window.confirm('Are you sure you want to clear all entries from the queue?');
    if (!confirmed) return;

    const res = await fetch('/api/remove-all', {
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
    // On success, real-time updates will refresh the queue automatically.
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
          <h2 className="text-2xl font-bold mb-4">Submit for Review</h2>
          {assignedCode ? (
            <div className="bg-green-600/20 border border-green-500 p-4 rounded text-center">
              <h3 className="text-xl font-bold text-green-400">You are in the queue!</h3>
              <p className="mt-2 text-gray-300">To jump ahead, donate at <strong>ko-fi.com/tylerramsbey</strong> and include this exact code in your message:</p>
              <p className="text-4xl font-black text-white my-4 tracking-widest">{assignedCode}</p>
              <button onClick={() => setAssignedCode(null)} className="text-sm underline text-gray-400 hover:text-white mt-2">Submit another</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input required placeholder="Your Name / Handle" className="p-2 bg-gray-700 rounded text-white" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <input required placeholder="URL 1 (LinkedIn, GitHub, etc)" className="p-2 bg-gray-700 rounded text-white" value={formData.url1} onChange={e => setFormData({...formData, url1: e.target.value})} />
              <input placeholder="URL 2 (Optional)" className="p-2 bg-gray-700 rounded text-white" value={formData.url2} onChange={e => setFormData({...formData, url2: e.target.value})} />
              <input placeholder="URL 3 (Optional)" className="p-2 bg-gray-700 rounded text-white" value={formData.url3} onChange={e => setFormData({...formData, url3: e.target.value})} />
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 font-bold p-3 rounded transition mt-2">Join Queue</button>
            </form>
          )}
        </div>

        {/* The Live Queue */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg h-fit">
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-2xl font-bold">Live Queue</h2>
             <div className="flex items-center gap-2">
               {adminPassword && (
                 <button
                   onClick={handleClearAll}
                   disabled={queue.length === 0}
                   className="bg-red-700 hover:bg-red-600 disabled:bg-red-900/40 disabled:text-red-200/40 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-1 rounded border border-red-500 transition"
                   title="Clear all queue entries"
                 >
                   Clear All
                 </button>
               )}
               {adminPassword && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500">Admin Mode Active</span>}
             </div>
          </div>
          
          <div className="flex flex-col gap-3">
            {queue.length === 0 && <p className="text-gray-400 italic">Queue is empty. Be the first!</p>}
            {queue.map((user, index) => (
              <div key={user.id} className={`p-4 rounded border flex justify-between ${user.is_priority ? 'bg-yellow-500/10 border-yellow-500' : 'bg-gray-700 border-gray-600'}`}>
                
                <div className="w-full">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">#{index + 1} - {user.name}</span>
                    {user.is_priority && <span className="text-xs bg-yellow-500 text-black px-2 py-1 font-black rounded uppercase tracking-wider">Priority</span>}
                  </div>
                  <div className="text-sm text-blue-400 mt-2 flex flex-col gap-1 overflow-hidden">
                    <a href={user.url1} target="_blank" rel="noreferrer" className="truncate hover:underline">{user.url1}</a>
                    {user.url2 && <a href={user.url2} target="_blank" rel="noreferrer" className="truncate hover:underline">{user.url2}</a>}
                    {user.url3 && <a href={user.url3} target="_blank" rel="noreferrer" className="truncate hover:underline">{user.url3}</a>}
                  </div>
                </div>

                {/* Admin Remove Button */}
                {adminPassword && (
                  <div className="ml-4 flex items-center border-l border-gray-600 pl-4">
                    <button 
                      onClick={() => handleRemove(user.id)}
                      className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-3 rounded transition"
                      title="Remove from queue"
                    >
                      X
                    </button>
                  </div>
                )}

              </div>
            ))}
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