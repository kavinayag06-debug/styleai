from datetime import datetime
import json

# ----------------------------------
# Color combinations
# ----------------------------------

COLOR_MATCH = {
    "white": ["black", "blue", "grey", "green", "beige"],
    "black": ["white", "grey", "blue"],
    "blue": ["white", "black", "grey"],
    "grey": ["white", "black", "blue"],
    "green": ["white", "black", "beige"],
    "beige": ["white", "green", "brown"]
}


# ----------------------------------
# Load closet
# ----------------------------------

def load_closet():
    with open("data/closet.json", "r") as file:
        return json.load(file)


# ----------------------------------
# Keep only active clothes
# ----------------------------------

def active_items(items):
    return [
        item
        for item in items
        if item["status"] == "active"
    ]


# ----------------------------------
# Filter by occasion
# ----------------------------------

def filter_by_occasion(items, occasion):
    return [
        item
        for item in items
        if occasion in item["occasion"]
    ]


# ----------------------------------
# Filter by season
# ----------------------------------

def filter_by_season(items, season):
    return [
        item
        for item in items
        if season in item["season"] or "all" in item["season"]
    ]


# ----------------------------------
# Days since last worn
# ----------------------------------

def days_since_worn(date_string):
    last = datetime.strptime(date_string, "%Y-%m-%d")
    return (datetime.today() - last).days


# ----------------------------------
# Score an item
# ----------------------------------

def score_item(item):

    score = 0

    # Prefer clothes not worn recently
    score += days_since_worn(item["last_worn"])

    # Penalize rejected clothes
    score -= item["rejection_count"] * 20

    return score


# ----------------------------------
# Rank clothes
# ----------------------------------

def rank_items(items):

    return sorted(
        items,
        key=score_item,
        reverse=True
    )


# ----------------------------------
# Pattern matching
# ----------------------------------

def patterns_match(top, bottom):

    if top["pattern"] == "solid":
        return True

    if bottom["pattern"] == "solid":
        return True

    return top["pattern"] == bottom["pattern"]


# ----------------------------------
# Recommend outfit
# ----------------------------------

def recommend_outfit(occasion, season):

    closet = load_closet()

    clothes = active_items(closet)
    clothes = filter_by_occasion(clothes, occasion)
    clothes = filter_by_season(clothes, season)

    tops = []
    bottoms = []
    shoes = []

    for item in clothes:

        if item["category"] == "top":
            tops.append(item)

        elif item["category"] == "bottom":
            bottoms.append(item)

        elif item["category"] == "shoes":
            shoes.append(item)

    tops = rank_items(tops)
    bottoms = rank_items(bottoms)
    shoes = rank_items(shoes)

    for top in tops:

        compatible = COLOR_MATCH.get(top["color"], [])

        for bottom in bottoms:

            if (
                bottom["color"] in compatible
                and patterns_match(top, bottom)
            ):

                return {
                    "top": top,
                    "bottom": bottom,
                    "shoes": shoes[0] if shoes else None
                }

    return None


# ----------------------------------
# Test
# ----------------------------------

outfit = recommend_outfit(
    occasion="casual",
    season="summer"
)

print("\nRecommended Outfit:\n")

print(outfit)