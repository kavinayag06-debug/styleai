import json
import os
from datetime import date

CLOSET_PATH = "data/closet.json"

def load_closet():
    if not os.path.exists(CLOSET_PATH):
        return []
    with open(CLOSET_PATH, "r") as f:
        return json.load(f)

def save_item(tags, filepath):
    closet = load_closet()

    # Generate new ID
    new_id = max([item["id"] for item in closet], default=0) + 1

    item = {
        "id": new_id,
        "name": tags.get("name", "Unknown Item"),
        "category": tags.get("category", "top"),
        "color": tags.get("color", "unknown"),
        "pattern": tags.get("pattern", "solid"),
        "fabric": tags.get("fabric", "unknown"),
        "occasion": tags.get("occasion", ["casual"]),
        "season": tags.get("season", ["all"]),
        "last_worn": str(date.today()),
        "rejection_count": 0,
        "status": "active",
        "image_path": filepath
    }

    closet.append(item)

    with open(CLOSET_PATH, "w") as f:
        json.dump(closet, f, indent=2)

    return item