import json
import os

import httpx
from openai import AsyncOpenAI


def _fallback_restyles(item, closet):
    others = [piece for piece in closet if piece.get("id") != item.get("id")]
    suggestions = []
    for piece in others[:3]:
        suggestions.append({
            "name": f"Pair with {piece.get('name', 'a closet staple')}",
            "description": f"Use the {item.get('name')} as the focal piece and balance it with the {piece.get('name')}.",
            "item_ids": [item.get("id"), piece.get("id")],
        })
    return suggestions


async def generate_restyles(item, closet):
    fallback = _fallback_restyles(item, closet)
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return fallback

    prompt = f"""You are a practical wardrobe stylist. Suggest exactly 3 genuinely different ways to restyle the selected item using only items in the supplied closet.
Selected item: {json.dumps(item)}
Closet: {json.dumps(closet)}
Do not invent item IDs. Keep advice concise and actionable.
Return JSON only: {{"styles":[{{"name":"short name","description":"one useful sentence","item_ids":[1,2]}}]}}"""
    try:
        response = await AsyncOpenAI(api_key=api_key).chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        data = json.loads(response.choices[0].message.content)
        valid_ids = {piece.get("id") for piece in closet}
        styles = []
        for style in data.get("styles", []):
            ids = [item_id for item_id in style.get("item_ids", []) if item_id in valid_ids]
            if item.get("id") not in ids:
                ids.insert(0, item.get("id"))
            styles.append({**style, "item_ids": ids})
        return styles or fallback
    except Exception as error:
        print(f"[restyle] OpenAI unavailable, using fallback: {error}")
        return fallback


async def search_tutorials(item):
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        raise RuntimeError("EXA_API_KEY is not configured")
    query = f"how to restyle or upcycle {item.get('color', '')} {item.get('name', '')} clothing tutorial DIY"
    payload = {
        "query": query,
        "type": "auto",
        "numResults": 6,
        "contents": {
            "text": {"maxCharacters": 260},
            "highlights": {"numSentences": 2, "highlightsPerUrl": 1},
        },
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.exa.ai/search",
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    tutorials = []
    for result in data.get("results", []):
        if not result.get("url"):
            continue
        tutorials.append({
            "title": result.get("title") or "Restyling tutorial",
            "url": result["url"],
            "image": result.get("image"),
            "summary": (result.get("highlights") or [result.get("text", "")])[0][:180],
            "source": result["url"].split("/")[2].replace("www.", ""),
        })
    return tutorials
