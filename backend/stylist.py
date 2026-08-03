import json
import os
from itertools import product
from openai import AsyncOpenAI


def fallback_outfits(items):
    tops = [item for item in items if item.get("category") == "top"]
    bottoms = [item for item in items if item.get("category") == "bottom"]
    outfits = []
    for index, (top, bottom) in enumerate(product(tops, bottoms)):
        if index >= 3:
            break
        outfits.append({
            "name": f"{top['color'].title()} & {bottom['color'].title()}",
            "item_ids": [top["id"], bottom["id"]],
            "reason": f"Pairs the {top['name']} with {bottom['name']} for a complete, balanced look.",
            "occasion": "Everyday",
        })
    return outfits


def _is_complete_outfit(ids, item_by_id):
    categories = {item_by_id[item_id]["category"] for item_id in ids if item_id in item_by_id}
    if "dress" in categories:
        return True
    return "top" in categories and "bottom" in categories


async def generate_outfits(items, occasion, season):
    fallback = fallback_outfits(items)
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"outfits": fallback, "source": "smart-fallback"}

    client = AsyncOpenAI(api_key=api_key)
    prompt = f"""You are the outfit-matching engine for a virtual closet.
Build exactly 3 stylish outfits for {occasion} in {season} using ONLY item IDs from this closet:
{json.dumps(items)}

OpenAI must make the actual fashion-matching decision based on colour, silhouette, pattern, fabric and occasion.
HARD RULES:
- Never return a top without a bottom.
- Never return a bottom without a top.
- Every separates-based outfit must contain at least one top AND one bottom from the closet.
- A dress may be recommended alone because it is a one-piece.
- Do not invent garments or IDs.
- Avoid combining a dress with a top or using a dress as a skirt.

Return only JSON:
{{"outfits":[{{"name":"short editorial name","item_ids":[1,2],"reason":"explain why the exact top and bottom match","occasion":"short label"}}]}}"""
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            temperature=0.65,
        )
        data = json.loads(response.choices[0].message.content)
        item_by_id = {item["id"]: item for item in items}
        clean = []
        for outfit in data.get("outfits", []):
            ids = list(dict.fromkeys(item_id for item_id in outfit.get("item_ids", []) if item_id in item_by_id))
            if _is_complete_outfit(ids, item_by_id):
                clean.append({**outfit, "item_ids": ids})
        return {"outfits": clean or fallback, "source": "openai"}
    except Exception as error:
        print(f"[stylist] OpenAI unavailable, using fallback: {error}")
        return {"outfits": fallback, "source": "smart-fallback"}


def _complementary_candidates(online_item, closet):
    category = online_item.get("category", "top")
    allowed = {
        "top": {"bottom"},
        "bottom": {"top"},
        "dress": {"outerwear"},
        "outerwear": {"top", "dress"},
    }.get(category, {"top", "bottom"})
    return [item for item in closet if item.get("status") == "active" and item.get("category") in allowed]


async def rank_closet_matches(online_item, closet):
    """Rank owned garments that can complete an outfit around one online find."""
    candidates = _complementary_candidates(online_item, closet)
    fallback = [{
        "item_id": item["id"],
        "score": max(62, 84 - index * 7),
        "reason": f"The {item.get('color', 'neutral')} {item.get('name', 'piece')} gives this {online_item.get('category', 'item')} a balanced, wearable counterpart.",
    } for index, item in enumerate(candidates)]
    if not candidates:
        return {"matches": [], "source": "no-compatible-items"}

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"matches": fallback, "source": "smart-fallback"}

    prompt = f"""You are a precise fashion compatibility engine.
Rank EVERY candidate garment from the user's closet by how well it completes an outfit with this online garment.

Online garment:
{json.dumps(online_item)}

Owned candidates:
{json.dumps(candidates)}

Judge colour harmony, silhouette balance, pattern interaction, fabric weight, formality and versatility.
Use only the candidate IDs supplied. Give each a distinct integer score from 0 to 100 and one specific sentence explaining the pairing. Return strongest first.
Return only JSON: {{"matches":[{{"item_id":1,"score":92,"reason":"specific explanation"}}]}}"""
    try:
        response = await AsyncOpenAI(api_key=api_key).chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            temperature=0.25,
        )
        raw = json.loads(response.choices[0].message.content).get("matches", [])
        by_id = {item["id"]: item for item in candidates}
        clean = []
        seen = set()
        for match in raw:
            item_id = match.get("item_id")
            if item_id not in by_id or item_id in seen:
                continue
            seen.add(item_id)
            clean.append({
                "item_id": item_id,
                "score": max(0, min(100, int(match.get("score", 0)))),
                "reason": str(match.get("reason") or "A compatible option from your closet."),
            })
        clean.extend(match for match in fallback if match["item_id"] not in seen)
        clean.sort(key=lambda match: match["score"], reverse=True)
        return {"matches": clean, "source": "openai"}
    except Exception as error:
        print(f"[stylist] Online-to-closet matching unavailable, using fallback: {error}")
        return {"matches": fallback, "source": "smart-fallback"}
