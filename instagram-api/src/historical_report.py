from collections import Counter
from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import InstagramPost, PostMetricsHistory, TrackedProfile
from .post_classification import apply_classification, classify_post_for_profile, empty_profile_summary, normalize_format, validate_profile_summary

settings = get_settings()


def _kind(media_type: str | None) -> str:
    return normalize_format(media_type)


def reconstruct(db: Session, report_date: date, cutoff_hour: int):
    zone = ZoneInfo(settings.app_timezone)
    start = datetime.combine(report_date, time.min, zone).astimezone(timezone.utc)
    cutoff = datetime.combine(report_date, time(cutoff_hour), zone).astimezone(timezone.utc)
    profiles = list(db.scalars(select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id, TrackedProfile.is_fixed.is_(True)).order_by(TrackedProfile.username)).all())
    tracked = {profile.username.lower() for profile in profiles}
    summaries = {name: {**empty_profile_summary(name), "audit": []} for name in tracked}
    rows = db.execute(select(InstagramPost, TrackedProfile).join(TrackedProfile, TrackedProfile.id == InstagramPost.tracked_profile_id).where(TrackedProfile.organization_id == settings.default_organization_id, InstagramPost.published_at >= start, InstagramPost.published_at <= cutoff)).all()
    contents: dict[str, dict] = {}
    for post, profile in rows:
        metric = db.scalar(select(PostMetricsHistory).where(PostMetricsHistory.post_id == post.id, PostMetricsHistory.collected_at <= cutoff).order_by(desc(PostMetricsHistory.collected_at)).limit(1))
        views = int((metric.views if metric else 0) or 0)
        key = post.instagram_id or post.shortcode
        owner = (post.owner_username or profile.username).lower()
        collaborators = [str(value).lower() for value in (post.collaborators or [])]
        participants = {profile.username.lower(), owner, *collaborators} & tracked
        kind = normalize_format(post.media_type, post.raw_payload, post.url)
        content = contents.setdefault(key, {"key": key, "views": views, "kind": kind, "owner": owner, "collaborators": collaborators, "profiles": [], "published_at": post.published_at.isoformat()})
        content["views"] = max(content["views"], views)
        for name in participants:
            if name not in content["profiles"]:
                content["profiles"].append(name)
        name = profile.username.lower()
        summary = summaries[name]
        summary["posts_found"] += 1
        summary["views_monitored"] += views
        classification = classify_post_for_profile(owner_username=owner, coowners=collaborators, profile_username=name, monitored_profiles=tracked, media_type=post.media_type, raw_payload=post.raw_payload, url=post.url)
        apply_classification(summary, classification)
        summary["audit"].append({"shortcode": post.shortcode, "owner": owner, "coowners": collaborators, "classification": classification})
        summary["posting_times"].append(post.published_at.astimezone(zone).strftime("%H:%M"))
    unique = list(contents.values())
    kinds = Counter(item["kind"] for item in unique)
    posting_times = sorted(item["published_at"] for item in unique)
    made = sum(1 for item in unique if item["owner"] in tracked and item["collaborators"])
    internal = sum(1 for item in unique if item["owner"] in tracked and (set(item["collaborators"]) & tracked))
    external = [{"external": item["owner"], "profile": name} for item in unique if item["owner"] not in tracked for name in item["profiles"]]
    for summary in summaries.values():
        summary["posting_times"].sort()
        validate_profile_summary(summary)
    return SimpleNamespace(status="success", trigger="scheduled", profiles=sorted(tracked), profiles_succeeded=sorted(tracked), profiles_failed=[], posts_found=len(unique), profile_appearances=sum(item["posts_found"] for item in summaries.values()), posts_new=0, posts_updated=0, collaborations_made=made, collaborations_received=sum(item["collaborations_received"] for item in summaries.values()), internal_collaborations=internal, external_collaborations=len({(item["external"], item["profile"]) for item in external}), views_monitored=sum(item["views"] for item in unique), unique_views=sum(item["views"] for item in unique), reels_count=kinds["reel"], posts_count=kinds["post"], carousels_count=kinds["carousel"], posting_times=[datetime.fromisoformat(value).astimezone(zone).strftime("%H:%M") for value in posting_times], profile_summaries=list(summaries.values()), report_payload={"contents": unique, "external_collabs": external}, started_at=cutoff, finished_at=cutoff, error=None)
