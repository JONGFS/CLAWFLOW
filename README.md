# ClawFlow

Minimal Python API scaffold for local development, GitHub, and deployment.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

The API will start on `http://localhost:8000`.

## Endpoints

- `GET /` returns a basic welcome message
- `GET /health` returns a healthcheck response

## Deployment

This repo includes:

- `.gitignore` for Python projects
- `requirements.txt` for dependency installation
- `Procfile` for common PaaS-style deployments
- `.github/workflows/ci.yml` for a basic GitHub Actions check

For most hosts, set the start command to:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## GitHub basics

```bash
git init
git add .
git commit -m "Initial deployment-ready scaffold"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```
