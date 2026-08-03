import json
import os

import httpx
from openai import AsyncOpenAI


FALLBACK_IDEAS = [
    {
        "title": "Convert the neckline",
        "description": "Use folding, tucking or the garment's existing ties to create a new neckline without cutting it.",
        "steps": ["Lay the garment flat and identify its natural fold lines.", "Fold or roll the neckline inward evenly.", "Secure hidden fabric with fashion tape or two small safety pins.", "Try it on and adjust both sides until the tension is even."],
    },
    {
        "title": "Change the silhouette",
        "description": "Create a cropped, fitted or asymmetric shape using reversible tucks and ties.",
        "steps": ["Put the garment on inside out.", "Gather excess fabric where you want the new hem or waist.", "Secure the gather with a soft hair tie.", "Turn it right-side out and hide the gathered section underneath."],
    },
    {
        "title": "Create a layered detail",
        "description": "Reposition sleeves, straps or hems to make the original piece read differently.",
        "steps": ["Choose one feature to reposition rather than changing everything.", "Fold the chosen section symmetrically.", "Secure it with fashion tape, pins or an existing tie.", "Move your arms and sit down to check that the restyle is comfortable."],
    },
]


async def _exa_sources(item):
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        return []
    query = f"{item.get('name', '')} {item.get('category', '')} transform restyle folding hack tutorial video no sew before after final result"
    payload = {
        "query": query,
        "type": "auto",
        "numResults": 8,
        "contents": {"text": {"maxCharacters": 1800}, "highlights": {"numSentences": 5, "highlightsPerUrl": 2}},
    }
    async with httpx.AsyncClient(timeout=35) as client:
        response = await client.post("https://api.exa.ai/search", headers={"x-api-key": api_key, "Content-Type": "application/json"}, json=payload)
        response.raise_for_status()
        results = response.json().get("results", [])
    return [{
        "title": result.get("title") or "Restyling tutorial",
        "url": result.get("url"),
        "image": result.get("image"),
        "content": (result.get("text") or "")[:1800],
        "highlights": result.get("highlights") or [],
        "source": (result.get("url") or "").split("/")[2].replace("www.", "") if result.get("url") else "",
    } for result in results if result.get("url")]


async def generate_restyle_guides(item):
    try:
        sources = await _exa_sources(item)
    except Exception as error:
        print(f"[restyle] Exa unavailable: {error}")
        sources = []

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return [{**idea, "tutorial": sources[index] if index < len(sources) else None} for index, idea in enumerate(FALLBACK_IDEAS)]

    source_text = json.dumps([{key: value for key, value in source.items() if key != "image"} for source in sources[:6]])
    prompt = f"""You are an expert clothing-restyling instructor. Create exactly 3 high-quality, reversible ways to physically transform how this exact garment is worn.
GARMENT: {json.dumps(item)}
WEB TUTORIAL MATERIAL: {source_text}

This is NOT outfit matching. Do not recommend pairing it with other closet items. Suggest techniques such as folding, tying, tucking, repositioning straps/sleeves, changing a neckline, creating a temporary crop, or another construction-appropriate transformation. Never suggest cutting a valuable garment unless explicitly labelled optional. Respect the actual garment category and fabric.

For each idea provide a clear title, why it works for this garment, 5-8 detailed numbered steps derived from the tutorial material or sound garment practice, safety/care notes, and the zero-based source_index of the closest tutorial (-1 if none).
Return JSON only: {{"ideas":[{{"title":"","description":"","steps":[""],"care_note":"","source_index":0}}]}}"""
    try:
        response = await AsyncOpenAI(api_key=api_key).chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            temperature=0.45,
        )
        ideas = json.loads(response.choices[0].message.content).get("ideas", [])[:3]
        clean = []
        for idea in ideas:
            source_index = idea.pop("source_index", -1)
            tutorial = sources[source_index] if isinstance(source_index, int) and 0 <= source_index < len(sources) else None
            clean.append({**idea, "tutorial": tutorial})
        return clean or [{**idea, "tutorial": sources[index] if index < len(sources) else None} for index, idea in enumerate(FALLBACK_IDEAS)]
    except Exception as error:
        print(f"[restyle] OpenAI unavailable, using fallback: {error}")
        return [{**idea, "tutorial": sources[index] if index < len(sources) else None} for index, idea in enumerate(FALLBACK_IDEAS)]
