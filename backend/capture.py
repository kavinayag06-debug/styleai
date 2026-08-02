import base64
import json
import os
from openai import AsyncOpenAI

def encode_image(filepath):
    with open(filepath, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

async def tag_clothing(filepath):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required to identify uploaded clothing")
    client = AsyncOpenAI(api_key=api_key)
    base64_image = encode_image(filepath)

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    },
                    {
                        "type": "text",
                        "text": """Analyse this clothing item photo and return ONLY a JSON object with these exact fields:
{
  "name": "short descriptive name e.g. White Cotton T-Shirt",
  "category": "top or bottom or dress or outerwear or shoes or accessory",
  "color": "dominant color as single word e.g. white",
  "pattern": "solid or striped or floral or plaid or other",
  "fabric": "cotton or denim or silk or knit or polyester or linen or leather or canvas or spandex or flannel or chiffon or other",
  "occasion": ["casual", "work", "formal", "workout"],
  "season": ["summer", "winter", "spring", "autumn", "all"]
}

Only include relevant occasions and seasons. Return JSON only, no markdown, no explanation."""
                    }
                ]
            }
        ],
        max_tokens=300
    )

    text = response.choices[0].message.content
    clean = text.replace("```json", "").replace("```", "").strip()
    return json.loads(clean)
