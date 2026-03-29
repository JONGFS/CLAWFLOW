from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import UploadFile
from supabase import create_client, Client

from backend.models import ListingInput, NormalizedListing, PhotoMeta
from backend.validation import flag_missing_fields

# Load .env from project root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

STORAGE_BUCKET = "listing-photos"

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set"
        )

    _client = create_client(url, key)
    return _client


async def upload_photos(
    listing_id: str, files: list[UploadFile]
) -> list[PhotoMeta]:
    """Upload photos to Supabase Storage and return metadata."""

    if not files:
        return []

    client = _get_client()
    photos: list[PhotoMeta] = []

    for file in files:
        photo_id = uuid.uuid4().hex[:12]
        ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
        storage_path = f"{listing_id}/{photo_id}{ext}"

        content = await file.read()
        client.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type or "image/jpeg"},
        )

        public_url = client.storage.from_(STORAGE_BUCKET).get_public_url(
            storage_path
        )

        photos.append(
            PhotoMeta(
                id=photo_id,
                filename=file.filename or f"{photo_id}{ext}",
                label=os.path.splitext(file.filename or "Photo")[0],
                url=public_url,
            )
        )

    return photos


async def store_listing(
    listing_input: ListingInput, files: list[UploadFile]
) -> NormalizedListing:
    """Validate, upload photos, persist to Supabase, and return normalized listing."""

    listing_id = uuid.uuid4().hex
    photos = await upload_photos(listing_id, files)
    missing = flag_missing_fields(listing_input, len(photos))
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "id": listing_id,
        "title": listing_input.title,
        "price": listing_input.price,
        "beds": listing_input.beds,
        "baths": listing_input.baths,
        "neighborhood": listing_input.neighborhood,
        "square_footage": listing_input.square_footage,
        "amenities": listing_input.amenities,
        "persona": listing_input.persona,
        "leasing_special": listing_input.leasing_special,
        "photo_count": len(photos),
        "photos": [p.model_dump() for p in photos],
        "missing_fields": missing,
        "created_at": now,
    }

    client = _get_client()
    client.table("listings").insert(row).execute()

    return NormalizedListing(**row)


async def get_listing(listing_id: str) -> NormalizedListing | None:
    """Retrieve a listing by ID from Supabase."""

    client = _get_client()
    result = client.table("listings").select("*").eq("id", listing_id).execute()

    if not result.data:
        return None

    row = result.data[0]
    return NormalizedListing(
        id=row["id"],
        title=row["title"],
        price=float(row["price"]),
        beds=row["beds"],
        baths=row["baths"],
        neighborhood=row["neighborhood"],
        amenities=row.get("amenities", []),
        persona=row.get("persona"),
        leasing_special=row.get("leasing_special"),
        photo_count=row.get("photo_count", 0),
        photos=[PhotoMeta(**p) for p in (row.get("photos") or [])],
        missing_fields=row.get("missing_fields", []),
        created_at=row["created_at"],
    )
