# Azzurro AI Interview Portal (FINAL)

## What runs on GitHub Pages
Upload these four files (minimum) for the website:
- index.html
- styles.css
- app.js
- supabase-config.js

> The page was blank before because the previous ZIP accidentally contained placeholder content.
> This ZIP contains the full real website files.

## Supabase setup
1) Create Storage bucket: `interviews` (PRIVATE recommended)
2) Run `001_init.sql` in Supabase SQL Editor

## Edge Functions (Email sending)
This repo is **single-folder**, but Supabase expects each function in its own folder.

When deploying with Supabase CLI, create folders like:
- supabase/functions/send-interview-email/index.ts
- supabase/functions/send-interview-email/config.toml
- supabase/functions/get-interview/index.ts
- supabase/functions/get-interview/config.toml

Then copy these files:
- send-interview-email.ts -> .../send-interview-email/index.ts
- send-interview-email.config.toml -> .../send-interview-email/config.toml
- get-interview.ts -> .../get-interview/index.ts
- get-interview.config.toml -> .../get-interview/config.toml

Set secrets using `.env.example` as a guide (never commit real .env).

## Configure Supabase keys
Edit `supabase-config.js`:
- SUPABASE_URL
- SUPABASE_ANON_KEY
(Email destination is already careers@azzurrohotels.com)

## Notes
Camera/mic needs HTTPS (GitHub Pages is fine).
