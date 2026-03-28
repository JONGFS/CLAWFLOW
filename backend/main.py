import json
import os
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# Remote branch models + storage
from backend.models import ListingInput, NormalizedListing
from backend.storage import store_listing, get_listing

# CrewAI pipeline + services
from backend.crew import run_pipeline
from backend.models.schemas import GenerateRequest, GenerationResult, StatusResponse
from backend.services import normalizer

OUTPUTS_DIR = Path(__file__).resolve().parent / "outputs"
OUTPUTS_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="LandlordFlip API",
    version="1.0.0",
    description="AI-powered rental promo video generation pipeline.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store (replace with Redis/DB for production)
_jobs: dict[str, StatusResponse] = {}


# ── helpers ───────────────────────────────────────────────────────────────────

async def _save_photos(files: list[UploadFile], job_id: str) -> list[str]:
    paths = []
    job_dir = OUTPUTS_DIR / job_id
    job_dir.mkdir(exist_ok=True)
    for i, file in enumerate(files):
        if not file.filename:
            continue
        suffix = Path(file.filename).suffix or ".jpg"
        dest = job_dir / f"photo_{i}{suffix}"
        content = await file.read()
        dest.write_bytes(content)
        paths.append(str(dest))
    return paths


def _run_job(job_id: str, listing_json: str, photo_paths: list[str]):
    """Background task: run the full crew pipeline and update job store."""
    try:
        _jobs[job_id] = StatusResponse(job_id=job_id, status="running", stage="Analyst")

        def on_stage(stage_name: str):
            _jobs[job_id] = StatusResponse(job_id=job_id, status="running", stage=stage_name)

        req = GenerateRequest(**json.loads(listing_json))
        listing = normalizer.normalize(req, photo_count=len(photo_paths))

        pipeline_result = run_pipeline(listing, on_stage_change=on_stage)

        positioning = pipeline_result["market_positioning"]
        hooks_result = pipeline_result["hooks_and_scripts"]
        scene_plan = pipeline_result["scene_plan"]
        critique = pipeline_result["critique"]

        selected_idx = hooks_result.selected_variant_index

        result = GenerationResult(
            job_id=job_id,
            listing=listing,
            market_positioning=positioning,
            hooks=hooks_result.hooks,
            scripts=hooks_result.variants,
            selected_script_index=selected_idx,
            scene_sequence=scene_plan.scene_sequence,
            confidence_score=critique.confidence_score,
            strengths=critique.strengths,
            weaknesses=critique.weaknesses,
            improvement_notes=critique.improvement_notes,
        )

        _jobs[job_id] = StatusResponse(job_id=job_id, status="done", result=result)

    except Exception as exc:
        _jobs[job_id] = StatusResponse(job_id=job_id, status="error", error=str(exc))
        raise


# ── base endpoints ────────────────────────────────────────────────────────────

@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "LandlordFlip API is running"}


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


# ── listing intake (remote branch) ────────────────────────────────────────────

@app.post("/api/listings", response_model=NormalizedListing)
async def create_listing(
    title: str = Form(...),
    price: float = Form(...),
    beds: int = Form(...),
    baths: int = Form(...),
    neighborhood: str = Form(...),
    square_footage: Optional[int] = Form(None),
    amenities: str = Form("[]"),
    persona: Optional[str] = Form(None),
    leasing_special: Optional[str] = Form(None),
    photos: list[UploadFile] = File(default=[]),
):
    try:
        amenities_list = json.loads(amenities)
    except (json.JSONDecodeError, TypeError):
        amenities_list = []

    listing_input = ListingInput(
        title=title,
        price=price,
        beds=beds,
        baths=baths,
        neighborhood=neighborhood,
        square_footage=square_footage,
        amenities=amenities_list,
        persona=persona,
        leasing_special=leasing_special,
    )

    result = await store_listing(listing_input, photos)
    return result


@app.get("/api/listings/{listing_id}", response_model=NormalizedListing)
async def read_listing(listing_id: str):
    listing = await get_listing(listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


# ── CrewAI generation pipeline ────────────────────────────────────────────────

@app.post("/api/generate", response_model=StatusResponse)
async def generate(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    price: str = Form(...),
    neighborhood: str = Form(...),
    square_footage: str = Form(None),
    beds: str = Form(None),
    baths: str = Form(None),
    amenities: str = Form("[]"),
    target_renter: str = Form("Young Professional"),
    leasing_special: str = Form(None),
    photos: list[UploadFile] = File(default=[]),
):
    job_id = str(uuid.uuid4())
    photo_paths = await _save_photos(photos, job_id)
    amenity_list: list[str] = json.loads(amenities) if amenities else []

    req = GenerateRequest(
        title=title,
        price=price,
        neighborhood=neighborhood,
        square_footage=square_footage,
        beds=beds,
        baths=baths,
        amenities=amenity_list,
        target_renter=target_renter,
        leasing_special=leasing_special,
    )

    _jobs[job_id] = StatusResponse(job_id=job_id, status="pending")
    background_tasks.add_task(_run_job, job_id, req.model_dump_json(), photo_paths)

    return StatusResponse(job_id=job_id, status="pending")


@app.get("/api/status/{job_id}", response_model=StatusResponse)
def get_status(job_id: str) -> StatusResponse:
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job



if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
