"""
LandlordFlip CrewAI pipeline.

Sequential flow:
  1. Analyst      → market positioning
  2. Hook Writer  → 3 hooks + 3 script variants (Copywriter merged in per hackathon MVP)
  3. Director     → scene-by-scene storyboard
  4. Critic       → confidence score + improvement notes
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from crewai import Crew, LLM, Process, Task

from backend.agents import analyst as analyst_module
from backend.agents import critic as critic_module
from backend.agents import director as director_module
from backend.agents import hook_writer as hook_writer_module
from backend.models.schemas import (
    CritiqueResult,
    HooksAndScripts,
    ListingData,
    MarketPositioning,
    ScenePlan,
    SceneItem,
    ScriptVariant,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of an agent response string."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Find the outermost {...} block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not extract JSON from agent output:\n{text[:500]}")


def _safe_get(data: dict, key: str, default: Any = None) -> Any:
    return data.get(key, default)


# ── crew factory ──────────────────────────────────────────────────────────────

def run_pipeline(listing: ListingData, on_stage_change: Any = None) -> dict:
    """
    Run the full CrewAI pipeline for a listing.
    Returns a dict with keys: market_positioning, hooks_and_scripts, scene_plan, critique.
    """
    model = os.getenv("CREWAI_MODEL", "anthropic/claude-sonnet-4-6")
    llm = LLM(model=model, temperature=0.7)

    # Build agents
    analyst = analyst_module.build(llm)
    hook_writer = hook_writer_module.build(llm)
    director = director_module.build(llm)
    critic = critic_module.build(llm)

    listing_json = listing.model_dump_json(indent=2)
    photo_indexes = list(range(listing.photo_count)) if listing.photo_count > 0 else [0]

    # ── Task 1: Market positioning ────────────────────────────────────────────
    analyze_task = Task(
        description=(
            f"Analyze this rental listing and output ONLY a JSON object with no "
            f"additional text.\n\nListing data:\n{listing_json}\n\n"
            f"Your JSON must have exactly these keys:\n"
            f"  target_audience (string)\n"
            f"  video_angle (string, one concise angle, e.g. 'what $X gets you near campus')\n"
            f"  key_selling_points (array of 3-5 strings, facts only from listing)\n"
            f"  constraints (array of strings, things to avoid mentioning or exaggerating)\n\n"
            f"Output ONLY the JSON object, no markdown fences, no explanation."
        ),
        agent=analyst,
        expected_output=(
            "A JSON object with keys: target_audience, video_angle, "
            "key_selling_points, constraints."
        ),
    )

    # ── Task 2: Hooks + scripts ───────────────────────────────────────────────
    hooks_task = Task(
        description=(
            f"Using the market positioning from the previous task and the listing below, "
            f"write 3 hooks and 3 matching scripts.\n\nListing:\n{listing_json}\n\n"
            f"Rules:\n"
            f"- Exactly 3 hooks. Each under 12 words.\n"
            f"- At least 1 price-led hook, at least 1 lifestyle/location hook.\n"
            f"- Each script: 45-90 words, ends with a CTA, uses only listing facts.\n"
            f"- Pick the best variant (index 0, 1, or 2) and set selected_variant_index.\n\n"
            f"Output ONLY a JSON object with exactly these keys:\n"
            f"  hooks (array of 3 strings)\n"
            f"  variants (array of 3 objects, each with: hook, body_copy, cta)\n"
            f"  selected_variant_index (integer 0-2)\n\n"
            f"No markdown fences, no explanation."
        ),
        agent=hook_writer,
        context=[analyze_task],
        expected_output=(
            "A JSON object with keys: hooks (array[3]), "
            "variants (array[3] of {{hook, body_copy, cta}}), selected_variant_index (int)."
        ),
    )

    # ── Task 3: Storyboard ────────────────────────────────────────────────────
    director_task = Task(
        description=(
            f"Using the selected script from the previous task, create a scene-by-scene "
            f"storyboard for a 15-30 second vertical rental promo video.\n\n"
            f"Available photo indexes: {photo_indexes}\n\n"
            f"Rules:\n"
            f"- Every scene must reference a real photo_index from: {photo_indexes}.\n"
            f"- Scene durations must sum to between 15 and 30 seconds.\n"
            f"- Each scene: 2.5-4.0 seconds.\n"
            f"- First scene: strongest photo, hook overlay text.\n"
            f"- Last scene: CTA text, can reuse any photo.\n"
            f"- overlay_text: short (3-7 words).\n"
            f"- voiceover_segment: the script words spoken during this scene.\n\n"
            f"Output ONLY a JSON object with exactly this key:\n"
            f"  scene_sequence (array of objects, each with: photo_index, overlay_text, "
            f"duration_sec, voiceover_segment)\n\n"
            f"No markdown fences, no explanation."
        ),
        agent=director,
        context=[analyze_task, hooks_task],
        expected_output=(
            "A JSON object with key: scene_sequence (array of "
            "{{photo_index, overlay_text, duration_sec, voiceover_segment}})."
        ),
    )

    # ── Task 4: Critique ──────────────────────────────────────────────────────
    critic_task = Task(
        description=(
            f"Review the selected rental promo script and storyboard from the previous tasks "
            f"and score the overall marketing quality.\n\n"
            f"Output ONLY a JSON object with exactly these keys:\n"
            f"  confidence_score (integer 0-100)\n"
            f"  strengths (array of 2-4 strings)\n"
            f"  weaknesses (array of 1-3 strings)\n"
            f"  improvement_notes (array of 1-3 actionable strings)\n\n"
            f"No markdown fences, no explanation."
        ),
        agent=critic,
        context=[analyze_task, hooks_task, director_task],
        expected_output=(
            "A JSON object with keys: confidence_score (int), strengths, "
            "weaknesses, improvement_notes (all arrays of strings)."
        ),
    )

    # ── Crew ──────────────────────────────────────────────────────────────────
    stage_order = ["Analyst", "Hook Writer", "Director", "Critic"]
    stage_index = [0]  # mutable for closure

    def _task_callback(output):
        stage_index[0] += 1
        if on_stage_change and stage_index[0] < len(stage_order):
            on_stage_change(stage_order[stage_index[0]])

    crew = Crew(
        agents=[analyst, hook_writer, director, critic],
        tasks=[analyze_task, hooks_task, director_task, critic_task],
        process=Process.sequential,
        verbose=True,
        task_callback=_task_callback,
    )

    crew.kickoff()

    # ── Parse task outputs ────────────────────────────────────────────────────
    raw_positioning = _extract_json(str(analyze_task.output.raw))
    raw_hooks = _extract_json(str(hooks_task.output.raw))
    raw_scenes = _extract_json(str(director_task.output.raw))
    raw_critique = _extract_json(str(critic_task.output.raw))

    # Build typed objects
    positioning = MarketPositioning(
        target_audience=_safe_get(raw_positioning, "target_audience", "General renters"),
        video_angle=_safe_get(raw_positioning, "video_angle", ""),
        key_selling_points=_safe_get(raw_positioning, "key_selling_points", []),
        constraints=_safe_get(raw_positioning, "constraints", []),
    )

    variants = [
        ScriptVariant(
            hook=v.get("hook", ""),
            body_copy=v.get("body_copy", ""),
            cta=v.get("cta", "Schedule a tour today"),
        )
        for v in _safe_get(raw_hooks, "variants", [])
    ]
    hooks_result = HooksAndScripts(
        hooks=_safe_get(raw_hooks, "hooks", []),
        variants=variants,
        selected_variant_index=int(_safe_get(raw_hooks, "selected_variant_index", 0)),
    )

    scene_items = [
        SceneItem(
            photo_index=min(int(s.get("photo_index", 0)), max(photo_indexes)),
            overlay_text=s.get("overlay_text", ""),
            duration_sec=float(s.get("duration_sec", 3.0)),
            voiceover_segment=s.get("voiceover_segment", ""),
        )
        for s in _safe_get(raw_scenes, "scene_sequence", [])
    ]
    scene_plan = ScenePlan(scene_sequence=scene_items)

    critique = CritiqueResult(
        confidence_score=int(_safe_get(raw_critique, "confidence_score", 75)),
        strengths=_safe_get(raw_critique, "strengths", []),
        weaknesses=_safe_get(raw_critique, "weaknesses", []),
        improvement_notes=_safe_get(raw_critique, "improvement_notes", []),
    )

    return {
        "market_positioning": positioning,
        "hooks_and_scripts": hooks_result,
        "scene_plan": scene_plan,
        "critique": critique,
    }
