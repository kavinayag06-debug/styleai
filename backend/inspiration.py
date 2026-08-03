import os
import json
import asyncio
from io import BytesIO
import httpx
from openai import AsyncOpenAI
from PIL import Image


async def search_outfit_inspiration(query: str, occasion: str = "casual"):
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        raise RuntimeError("EXA_API_KEY is not configured")

    search_query = f"{query} {occasion} outfit fashion styling inspiration shop the look"
    payload = {
        "query": search_query,
        "type": "auto",
        "numResults": 8,
        "contents": {
            "text": {"maxCharacters": 300},
            "highlights": {"numSentences": 2, "highlightsPerUrl": 1},
        },
    }
    headers = {"x-api-key": api_key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post("https://api.exa.ai/search", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    results = []
    for result in data.get("results", []):
        url = result.get("url")
        if not url:
            continue
        results.append({
            "title": result.get("title") or "Outfit inspiration",
            "url": url,
            "image": result.get("image"),
            "summary": (result.get("highlights") or [result.get("text", "")])[0][:220],
            "source": result.get("author") or url.split("/")[2].replace("www.", ""),
        })
    return results


async def search_shoppable_products(query: str, closet: list, vibe: list, surprise: bool = False):
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        raise RuntimeError("EXA_API_KEY is not configured")
    closet_summary = ", ".join(f"{item.get('color')} {item.get('category')}" for item in closet[:12])
    vibe_text = ", ".join(vibe) or "versatile personal style"
    intent = f"surprise fashion pieces matching {vibe_text} that complement a closet with {closet_summary}" if surprise else query
    openai_key = os.environ.get("OPENAI_API_KEY")
    if surprise and openai_key:
        try:
            direction = await AsyncOpenAI(api_key=openai_key).chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": f"Write one concise product-search query for 6 individual garments that fill useful gaps in this closet: {closet_summary}. User style: {vibe_text}. Focus on pieces that coordinate with what they own. Return only the search query."}],
                temperature=0.65,
            )
            intent = direction.choices[0].message.content.strip()
        except Exception as error:
            print(f"[products] AI shopping direction unavailable: {error}")
    search_query = f"{intent} product full body model wearing outfit mannequin buy SHEIN Shopee Zalora H&M clothing"
    payload = {
        "query": search_query,
        "type": "auto",
        "numResults": 12,
        "includeDomains": ["shein.com", "shopee.sg", "zalora.sg", "hm.com"],
        "contents": {"text": {"maxCharacters": 450}, "highlights": {"numSentences": 2, "highlightsPerUrl": 1}},
    }
    async with httpx.AsyncClient(timeout=35) as client:
        response = await client.post("https://api.exa.ai/search", headers={"x-api-key": api_key, "Content-Type": "application/json"}, json=payload)
        response.raise_for_status()
        raw = response.json().get("results", [])

    products = [{
        "title": result.get("title") or "Online fashion find",
        "url": result.get("url"),
        "image": result.get("image"),
        "summary": (result.get("highlights") or [result.get("text", "")])[0][:220],
        "retailer": (result.get("url") or "").split("/")[2].replace("www.", "") if result.get("url") else "",
        "category": "top",
        "color": "unknown",
    } for result in raw if result.get("url") and result.get("image")]

    async def portrait_score(product):
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as image_client:
                image_response = await image_client.get(product["image"])
                if len(image_response.content) > 8_000_000:
                    return 0
            with Image.open(BytesIO(image_response.content)) as preview:
                width, height = preview.size
            product["image_width"] = width
            product["image_height"] = height
            product["full_body_preferred"] = height / max(width, 1) >= 1.2
            return 2 if height / max(width, 1) >= 1.45 else 1 if height > width else 0
        except Exception:
            product["full_body_preferred"] = False
            return 0

    scores = await asyncio.gather(*(portrait_score(product) for product in products))
    products = [product for _, product in sorted(zip(scores, products), key=lambda pair: pair[0], reverse=True)]

    if openai_key and products:
        try:
            response = await AsyncOpenAI(api_key=openai_key).chat.completions.create(
                model="gpt-4o-mini",
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": f"Classify each product title as top, bottom, dress, or outerwear and infer its main color. Preserve order. Return JSON {{\"items\":[{{\"category\":\"top\",\"color\":\"blue\"}}]}}. Products: {json.dumps([p['title'] for p in products])}"}],
                temperature=0,
            )
            labels = json.loads(response.choices[0].message.content).get("items", [])
            for product, label in zip(products, labels):
                if label.get("category") in {"top", "bottom", "dress", "outerwear"}:
                    product["category"] = label["category"]
                product["color"] = label.get("color") or "unknown"
        except Exception as error:
            print(f"[products] classification unavailable: {error}")
    return products
