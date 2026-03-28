import json
import os
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.models import ListingInput, NormalizedListing
from backend.storage import store_listing, get_listing

app = FastAPI(
    title="LandlordFlip API",
    version="0.1.0",
    description="Backend scaffold for the LandlordFlip workspace.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "LandlordFlip API is running"}


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


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


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
