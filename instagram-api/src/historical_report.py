from collections import Counter
from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import InstagramPost, PostMetricsHistory, TrackedProfile

settings = get_settings()


def _kind(media_type: str | None) -> str:
    value = (media_type or "").lower()
    if "carousel" in value or "sidecar" in value or "album" in value:
        return "carousel"
    if "video" in value or "reel" in value:
        return "reel"
    return "post"


def reconstruct(db: Session, report_date: date, cutoff_hour: int):
    zone = ZoneInfo(settings.app_timezone)
    start = datetime.combine(report_date, time.min, zone).astimezone(timezone.utc)
    cutoff = datetime.combine(report_date, time(cutoff_hour), zone).astimezone(timezone.utc)
    profiles = list(db.scalars(select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id, TrackedProfile.is_fixed.is_(True)).order_by(TrackedProfile.username)).all())
    tracked = {profile.username.lower() for profile in profiles}
    summaries = {name: {"username": name, "posts_found": 0, "views_monitored": 0, "reels_count": 0, "posts_count": 0, "carousels_count": 0, "collaborations_made": 0, "collaborations_received": 0, "posting_times": []} for name in tracked}
    rows = db.execute(select(InstagramPost, TrackedProfile).join(TrackedProfile, TrackedProfile.id == InstagramPost.tracked_profile_id).where(TrackedProfile.organization_id == settings.default_organization_id, InstagramPost.published_at >= start, InstagramPost.published_at <= cutoff)).all()
    contents: dict[str, dict] = {}
    for post, profile in rows:
        metric = db.scalar(select(PostMetricsHistory).where(PostMetricsHistory.post_id == post.id, PostMetricsHistory.collected_at <= cutoff).order_by(desc(PostMetricsHistory.collected_at)).limit(1))
        views = int((metric.views if metric else 0) or 0)
        key = post.instagram_id or post.shortcode
        owner = (post.owner_username or profile.username).lower()
        collaborators = [str(value).lower() for value in (post.collaborators or [])]
        participants = {profile.username.lower(), owner, *collaborators} & tracked
        content = contents.setdefault(key, {"key": key, "views": views, "kind": _kind(post.media_type), "owner": owner, "collaborators": collaborators, "profiles": [], "published_at": post.published_at.isoformat()})
        content["views"] = max(content["views"], views)
        for name in participants:
            if name not in content["profiles"]:
                content["profiles"].append(name)
        name = profile.username.lower()
        summary = summaries[name]
        summary["posts_found"] += 1
        summary["views_monitored"] += views
        summary[{"reel": "reels_count", "carousel": "carousels_count", "post": "posts_count"}[_kind(post.media_type)]] += 1
        summary["posting_times"].append(post.published_at.astimezone(zone).strftime("%H:%M"))
        if owner == name and collaborators:
            summary["collaborations_made"] += 1
        elif owner != name:
            summary["collaborations_received"] += 1
    unique = list(contents.values())
    kinds = Counter(item["kind"] for item in unique)
    posting_times = sorted(item["published_at"] for item in unique)
    made = sum(1 for item in unique if item["owner"] in tracked and item["collaborators"])
    internal = sum(1 for item in unique if item["owner"] in tracked and (set(item["collaborators"]) & tracked))
    external = [{"external": item["owner"], "profile": name} for item in unique if item["owner"] not in tracked for name in item["profiles"]]
    for summary in summaries.values():
        summary["posting_times"].sort()
    return SimpleNamespace(status="success", trigger="scheduled", profiles=sorted(tracked), profiles_succeeded=sorted(tracked), profiles_failed=[], posts_found=len(unique), profile_appearances=sum(item["posts_found"] for item in summaries.values()), posts_new=0, posts_updated=0, collaborations_made=made, collaborations_received=sum(item["collaborations_received"] for item in summaries.values()), internal_collaborations=internal, external_collaborations=len({(item["external"], item["profile"]) for item in external}), views_monitored=sum(item["views"] for item in unique), unique_views=sum(item["views"] for item in unique), reels_count=kinds["reel"], posts_count=kinds["post"], carousels_count=kinds["carousel"], posting_times=[datetime.fromisoformat(value).astimezone(zone).strftime("%H:%M") for value in posting_times], profile_summaries=list(summaries.values()), report_payload={"contents": unique, "external_collabs": external}, started_at=cutoff, finished_at=cutoff, error=None)
