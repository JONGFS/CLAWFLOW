# LandlordFlip

LandlordFlip is split into two deployable apps:

- `frontend/`: Vite + React app, deployed to Vercel
- `backend/`: FastAPI + CrewAI API, deployed to Render

This repo now includes the deployment config for both platforms so you can ship the current prototype without moving files around.

## Repo layout

```text
backend/      FastAPI API and agent pipeline
frontend/     Vite + React client
render.yaml   Render blueprint for the API
vercel.json   Vercel build config for the frontend
Procfile      Local/Heroku-style backend start command
```

## Local development

Create a root `.env` from `.env.example`, then run each app separately.

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m backend.main
```

The API runs on `http://127.0.0.1:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://127.0.0.1:3000`.

## Deploying the backend on Render

This repo includes `render.yaml`, so the easiest path is:

1. Push this repo to GitHub.
2. In Render, create a new Blueprint service from the repo.
3. Render will detect `render.yaml` and create the FastAPI web service.
4. Add the required environment variables before the first deploy.

### Render environment variables

Required:

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `OPENAI_API_KEY`
- `CREWAI_MODEL`
- `CORS_ALLOW_ORIGINS`
- `CORS_ALLOW_ORIGIN_REGEX`

Recommended CORS setup:

- For one production frontend URL:
  - `CORS_ALLOW_ORIGINS=https://your-app.vercel.app`
- If you also want Vercel preview deploys:
  - `CORS_ALLOW_ORIGIN_REGEX=^https://.*\.vercel\.app$`

The Render service exposes:

- `GET /health`
- `POST /api/generate`
- `POST /api/listings`

## Deploying the frontend on Vercel

This repo includes `vercel.json`, so you can import the repo directly without moving the frontend to the root.

1. In Vercel, import this GitHub repo.
2. Leave the project rooted at the repo root.
3. Vercel will use `vercel.json` to install from `frontend/`, build the Vite app, and publish `frontend/dist`.
4. Add the frontend environment variables in the Vercel dashboard.

### Vercel environment variables

Required:

- `VITE_API_URL=https://your-render-service.onrender.com`
- `VITE_SUPABASE_URL=https://your-project-id.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key`

If you change the Render URL later, update `VITE_API_URL` and redeploy the frontend.

## Notes

- The backend job store is still in memory, so generation statuses reset on deploy/restart.
- The frontend previews videos in-browser with Remotion Player; it does not yet render and store an MP4.
- The brainrot easter egg mode and the 30-second generation target are both retained in this deploy setup.
