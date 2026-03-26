Live Stream Queue & Priority Review App
==========================================

Created by [Tyler Ramsbey](https://youtube.com/@TylerRamsbey). This is an open-source, real-time queue system built for live streamers who do portfolio, resume, or code reviews.

It allows viewers to submit their links to a live queue that updates in real-time on stream. It also includes an automated "Jump the Line" feature where viewers can donate via Ko-fi with a unique 4-digit code to automatically be bumped to the top of the queue!

<img width="1014" height="460" alt="image" src="https://github.com/user-attachments/assets/d9db97e7-93f1-4972-bdd1-2e7b575480e7" />


Features
----------

-   **Real-Time Updates:** The queue updates instantly for all viewers without refreshing, powered by Supabase.

-   **Automated Priority:** Seamless Ko-fi webhook integration automatically bumps donating viewers to the top.

-   **Hidden Admin Mode:** Secret passcode login on the frontend to manage and remove completed reviews.

-   **Dual Submission Modes:** Admins can switch between review mode (name + links) and question mode (name + question text) without redeploying.

-   **Duplicate Blocking (Active Queue):** New submissions are blocked if the same name or same primary value is already waiting in the queue.

-   **Free to Host:** Designed to run entirely on the free tiers of Vercel and Supabase.

* * * * *

Step-by-Step Setup Guide
----------------------------

To set this up for your own stream, you will need free accounts on **GitHub**, **Supabase**, and **Vercel**.

### Step 1: Set up the Database (Supabase)

1.  Go to [Supabase](https://supabase.com/) and create a new project.

2.  In your project, go to the **SQL Editor** on the left menu.

3.  Paste and run the following SQL command to create your table, enable real-time updates, and allow public submissions:

SQL

```
CREATE TABLE queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url1 TEXT NOT NULL,
  url2 TEXT,
  url3 TEXT,
  is_priority BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Turn on Realtime for the stream overlay
ALTER PUBLICATION supabase_realtime ADD TABLE queue;

-- Allow public submissions from your viewers
ALTER TABLE queue DISABLE ROW LEVEL SECURITY;

```

1.  Go to **Project Settings -> API** and keep this tab open. You will need the `Project URL` and the `anon public key` in the next step.

### Step 2: Deploy the App (Vercel)

1.  Fork this repository to your own GitHub account.

2.  Go to [Vercel](https://vercel.com/) and click **Add New... -> Project**.

3.  Import your newly forked GitHub repository.

4.  Before clicking Deploy, open the **Environment Variables** section and add the following three variables:

    -   `NEXT_PUBLIC_SUPABASE_URL`: (Paste your Supabase Project URL here)

    -   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (Paste your Supabase anon public key here)

    -   `ADMIN_PASSWORD`: (Create a secret password to manage your queue, e.g., `super_secret_stream_pass`)

5.  Click **Deploy**!

### Step 3: Connect Ko-fi Donations

To enable the automatic "Jump the Line" feature, you need to tell Ko-fi to talk to your new app.

1.  Copy your new live Vercel domain (e.g., `https://your-app.vercel.app`).

2.  Go to your Ko-fi account -> **Settings -> API / Webhooks**.

3.  Paste your domain and add `/api/kofi` to the end of it. *(Example: `https://your-app.vercel.app/api/kofi`)*

4.  Click **Update** and send a test webhook.

### Step 4: How to Manage Your Queue (Admin Mode)

1.  Go to your live website.

2.  Scroll to the absolute bottom and click the tiny "Admin Login" text.

3.  Enter the `ADMIN_PASSWORD` you set in Vercel.

4.  Red "X" buttons will appear next to everyone's name, allowing you to remove them as you finish their reviews on stream. 
5.  Use the admin controls to switch between **Review Mode** and **Question Mode** for new submissions.

  -   **Review Mode:** viewers submit their name plus links.
  -   **Question Mode:** viewers submit their name plus a question text box.
  -   Mode changes only affect new submissions. Existing queue entries continue displaying in the format they were submitted with.

### Notes on Data Storage

-   This project reuses the existing `url1` field to store question text when Question Mode is active.
-   Question-mode entries are tagged internally so the UI can render them as question text instead of links.

### Duplicate Submission Rules

-   Duplicate checks only apply to records currently in `status = 'waiting'`.
-   A new submission is blocked if either condition is true:
  -   The same name/handle is already waiting.
  -   The same primary value is already waiting (`url1`, which is link in review mode and question text in question mode).
-   Matching is case-insensitive.
-   Review-mode links are normalized for comparison (protocol and trailing slash differences are treated as the same link).
-   Once a submission is removed or the queue is cleared, that name/link/question can be submitted again.
