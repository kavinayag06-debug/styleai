import os
import httpx


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
