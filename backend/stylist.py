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
