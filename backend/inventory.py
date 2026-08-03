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

def donate_item(item_id):
    closet = load_closet()
    item = next((piece for piece in closet if piece.get("id") == item_id), None)
    if not item:
        return None
    item["status"] = "donated"
    with open(CLOSET_PATH, "w") as f:
        json.dump(closet, f, indent=2)
    return item

def delete_item(item_id):
    closet = load_closet()
    remaining = [item for item in closet if item.get("id") != item_id]
    if len(remaining) == len(closet):
        return None
    with open(CLOSET_PATH, "w") as f:
        json.dump(remaining, f, indent=2)
    return True

def save_online_item(name, category, color, source_url, filepath):
    tags = {
        "name": name or "Online find",
        "category": category if category in {"top", "bottom", "dress", "outerwear"} else "top",
        "color": color or "unknown",
        "pattern": "unknown",
        "fabric": "unknown",
        "occasion": ["casual"],
        "season": ["all"],
    }
    item = save_item(tags, filepath)
    item["source_url"] = source_url
    closet = load_closet()
    for index, existing in enumerate(closet):
        if existing.get("id") == item["id"]:
            closet[index] = item
    with open(CLOSET_PATH, "w") as f:
        json.dump(closet, f, indent=2)
    return item
