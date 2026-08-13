from __future__ import annotations


def normalize_format(media_type: str | None, raw_payload: dict | None = None, url: str | None = None) -> str:
    raw = raw_payload or {}
    value = str(media_type or "").lower()
    product = str(raw.get("productType") or "").lower()
    children = raw.get("childPosts") if isinstance(raw.get("childPosts"), list) else []
    images = raw.get("images") if isinstance(raw.get("images"), list) else []
    if value in {"sidecar", "carousel", "album"} or len(children) > 1 or len(images) > 1:
        return "carousel"
    if value in {"video", "reel", "reels", "clips"} or product in {"clips", "reels"} or "/reel/" in str(url or "").lower():
        return "reel"
    if value in {"image", "photo", "post", "graphimage", ""}:
        return "post"
    return "other"


def classify_post_for_profile(*, owner_username: str | None, coowners: list | None, profile_username: str, monitored_profiles: set[str], media_type: str | None, raw_payload: dict | None = None, url: str | None = None) -> dict:
    owner = (owner_username or "").lower()
    profile = profile_username.lower()
    collaborators = {str(value).lower() for value in (coowners or []) if value}
    if owner == profile:
        origin = "own"
    elif profile in collaborators:
        origin = "received_internal" if owner in monitored_profiles else "received_external"
    else:
        origin = "unclassified"
    return {"origin": origin, "has_collab": bool(collaborators), "format": normalize_format(media_type, raw_payload, url)}


def empty_profile_summary(username: str) -> dict:
    return {"username": username, "posts_found": 0, "posts_new": 0, "posts_updated": 0, "originated_by_profile": 0, "own_without_collab": 0, "originated_with_collab": 0, "received_by_collab": 0, "received_internal": 0, "received_external": 0, "collaborations_made": 0, "collaborations_received": 0, "unclassified_count": 0, "views_monitored": 0, "reels_count": 0, "posts_count": 0, "carousels_count": 0, "other_formats_count": 0, "posting_times": []}


def apply_classification(summary: dict, classification: dict) -> None:
    origin = classification["origin"]
    if origin == "own":
        summary["originated_by_profile"] += 1
        summary["originated_with_collab" if classification["has_collab"] else "own_without_collab"] += 1
        if classification["has_collab"]:
            summary["collaborations_made"] += 1
    elif origin in {"received_internal", "received_external"}:
        summary["received_by_collab"] += 1
        summary["collaborations_received"] += 1
        summary[origin] += 1
    else:
        summary["unclassified_count"] += 1
    field = {"reel": "reels_count", "post": "posts_count", "carousel": "carousels_count", "other": "other_formats_count"}[classification["format"]]
    summary[field] += 1


def validate_profile_summary(summary: dict) -> None:
    total = int(summary["posts_found"])
    equations = [
        (total, int(summary["originated_by_profile"]) + int(summary["received_by_collab"]), "origem"),
        (int(summary["originated_by_profile"]), int(summary["own_without_collab"]) + int(summary["originated_with_collab"]), "publicadas pelo perfil"),
        (int(summary["received_by_collab"]), int(summary["received_internal"]) + int(summary["received_external"]), "collabs recebidas"),
        (total, int(summary["reels_count"]) + int(summary["posts_count"]) + int(summary["carousels_count"]), "formatos"),
    ]
    if summary.get("unclassified_count") or summary.get("other_formats_count"):
        raise ValueError(f"Classificação incompleta para @{summary['username']}: origem={summary.get('unclassified_count', 0)}, outros_formatos={summary.get('other_formats_count', 0)}")
    for left, right, label in equations:
        if left != right:
            raise ValueError(f"Inconsistência de {label} para @{summary['username']}: {left} != {right}")
