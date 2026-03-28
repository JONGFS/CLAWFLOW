from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Intake ────────────────────────────────────────────────────────────────────

class ListingData(BaseModel):
    title: str
    price: int
    beds: Optional[int] = None
    baths: Optional[int] = None
    neighborhood: str
    square_footage: Optional[int] = None
    amenities: list[str] = Field(default_factory=list)
    persona: Optional[str] = None
    leasing_special: Optional[str] = None
    photo_count: int = 0


# ── Agent outputs ─────────────────────────────────────────────────────────────

class MarketPositioning(BaseModel):
    target_audience: str
    video_angle: str
    key_selling_points: list[str]
    constraints: list[str] = Field(default_factory=list)


class ScriptVariant(BaseModel):
    hook: str
    body_copy: str
    cta: str


class HooksAndScripts(BaseModel):
    hooks: list[str]
    variants: list[ScriptVariant]
    selected_variant_index: int = 0


class SceneItem(BaseModel):
    photo_index: int
    overlay_text: str
    duration_sec: float
    voiceover_segment: str


class ScenePlan(BaseModel):
    scene_sequence: list[SceneItem]


class CritiqueResult(BaseModel):
    confidence_score: int = Field(ge=0, le=100)
    strengths: list[str]
    weaknesses: list[str]
    improvement_notes: list[str]


# ── API request / response ────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    title: str
    price: str
    neighborhood: str
    square_footage: Optional[str] = None
    beds: Optional[str] = None
    baths: Optional[str] = None
    amenities: list[str] = Field(default_factory=list)
    target_renter: str = "Young Professional"
    leasing_special: Optional[str] = None


class GenerationResult(BaseModel):
    job_id: str
    listing: ListingData
    market_positioning: MarketPositioning
    hooks: list[str]
    scripts: list[ScriptVariant]
    selected_script_index: int
    scene_sequence: list[SceneItem]
    confidence_score: int
    strengths: list[str]
    weaknesses: list[str]
    improvement_notes: list[str]


class StatusResponse(BaseModel):
    job_id: str
    status: str  # "pending" | "running" | "done" | "error"
    stage: Optional[str] = None
    result: Optional[GenerationResult] = None
    error: Optional[str] = None
