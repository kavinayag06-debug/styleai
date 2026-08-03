import hashlib
import hmac
import os
import secrets


DEMO_EMAIL = os.environ.get("STYLEAI_DEMO_EMAIL", "signintothings123@gmail.com")
DEMO_PASSWORD_HASH = hashlib.sha256(os.environ.get("STYLEAI_DEMO_PASSWORD", "password123").encode()).hexdigest()
TOKENS = {}

USER_PROFILE = {
    "name": "Pooja Hedge",
    "email": DEMO_EMAIL,
    "initials": "PH",
    "style_preferences": ["vintage", "cottagecore", "soft minimalism"],
    "preferred_colors": ["aqua", "blue", "grey", "cream"],
    "fit_preferences": ["balanced silhouettes", "comfortable", "wide-leg bottoms"],
    "shopping_priorities": ["re-wearable", "easy to style", "lower waste"],
}


def login(email, password):
    supplied_hash = hashlib.sha256(password.encode()).hexdigest()
    if not hmac.compare_digest(email.strip().lower(), DEMO_EMAIL.lower()) or not hmac.compare_digest(supplied_hash, DEMO_PASSWORD_HASH):
        return None
    token = secrets.token_urlsafe(32)
    TOKENS[token] = USER_PROFILE
    return token, USER_PROFILE


def user_for_token(token):
    return TOKENS.get(token)
