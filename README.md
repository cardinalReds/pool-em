# Pool'em 🟢

Private prediction pools for the beautiful game. Built for FIFA World Cup 2026.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Open `.env.local` and fill in your keys:
```
NEXT_PUBLIC_SUPABASE_URL=https://bsrvqpggsxyrxatdtnqf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_key_here
API_FOOTBALL_KEY=your_api_football_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set up the database
1. Go to your Supabase project → SQL Editor
2. Copy the entire contents of `supabase-schema.sql`
3. Paste and click **Run**

### 4. Run locally
```bash
npm run dev
```
Visit http://localhost:3000

## Deploy to Vercel
1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import your repo
3. Add the same environment variables in Vercel's project settings
4. Deploy

## Rule Packages
- **WLD** — Win/Loss/Draw. 1pt per correct result.
- **WLD+1TS** — WLD plus first goalscorer. 1pt result, 3pts scorer.
- **EXACT_SCORE** — Exact final score. 3pts exact, 1pt for correct result.
- **EXACT_1TS** — Full package. Exact score + first goalscorer.

## Tech Stack
- Next.js 14 (App Router)
- Supabase (Auth + Database)
- API-Football via api-sports.io
- Tailwind CSS
- Deployed on Vercel
