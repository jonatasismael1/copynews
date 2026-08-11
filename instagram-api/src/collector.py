import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal
from .models import CollectionRun, InstagramPost, PostMetricsHistory, TrackedProfile

log = logging.getLogger(__name__)
settings = get_settings()
collection_lock = asyncio.Lock()


def _integer(item: dict, *keys: str) -> int | None:
    for key in keys:
        value = item.get(key)
        if value is not None and not isinstance(value, bool):
            try:
                parsed = int(value)
                return parsed if parsed >= 0 else None
            except (TypeError, ValueError):
                pass
    return None


def _date(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_item(item: dict) -> dict:
    owner = item.get("owner") if isinstance(item.get("owner"), dict) else {}
    video = item.get("video") if isinstance(item.get("video"), dict) else {}
    code = item.get("code") or item.get("shortCode") or item.get("shortcode")
    url = item.get("url") or (f"https://www.instagram.com/p/{code}/" if code else None)
    collaborators = item.get("coowners") or item.get("coauthorProducers") or []
    normalized_collaborators = []
    for value in collaborators if isinstance(collaborators, list) else []:
        name = value.get("username") if isinstance(value, dict) else value
        if name:
            normalized_collaborators.append(str(name).lower())
    input_source = str(item.get("inputSource") or item.get("inputUrl") or "").rstrip("/").split("/")[-1].lower() or None
    return {
        "instagram_id": str(item.get("id") or item.get("pk") or code or ""),
        "shortcode": code,
        "url": url,
        "caption": item.get("caption") or item.get("text"),
        "published_at": _date(item.get("createdAt") or item.get("timestamp") or item.get("takenAt")),
        "owner_username": (owner.get("username") or item.get("owner.username") or item.get("ownerUsername") or item.get("username") or "").lower() or None,
        "source_username": input_source,
        "collaborators": normalized_collaborators,
        "media_type": "carousel" if item.get("isCarousel") else ("video" if item.get("isVideo") else (item.get("type") or item.get("productType"))),
        "thumbnail_url": item.get("displayUrl") or item.get("thumbnailUrl") or item.get("imageUrl") or ((item.get("image") or {}).get("url") if isinstance(item.get("image"), dict) else None),
        "likes": _integer(item, "likeCount", "likesCount", "likes"),
        "comments": _integer(item, "commentCount", "commentsCount", "comments"),
        "views": _integer(item, "videoViewCount", "viewCount", "views"),
        "plays": _integer(item, "videoPlayCount", "playCount", "plays") if _integer(item, "videoPlayCount", "playCount", "plays") is not None else _integer(video, "playCount"),
        "raw_payload": item,
    }


async def _run_actor(usernames: list[str]) -> tuple[str, list[dict]]:
    actor = settings.apify_actor_id.replace("/", "~")
    endpoint = f"https://api.apify.com/v2/acts/{actor}/runs"
    profile_urls = [f"https://www.instagram.com/{name}/" for name in usernames]
    if settings.apify_actor_id == "apify/instagram-scraper":
        local_today = datetime.now(ZoneInfo(settings.app_timezone)).date()
        body = {
            "resultsType": "posts",
            "directUrls": profile_urls,
            "resultsLimit": settings.max_posts_per_profile,
            "onlyPostsNewerThan": (local_today - timedelta(days=settings.report_days - 1)).isoformat(),
            "addParentData": True,
        }
    else:
        body = {
            "startUrls": profile_urls,
            "maxItems": settings.max_posts_per_profile * len(usernames),
            "customMapFunction": "(object) => { return {...object} }",
        }
    headers = {"Authorization": f"Bearer {settings.apify_token}"}
    timeout = httpx.Timeout(settings.request_timeout_seconds, connect=30)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(endpoint, params={"waitForFinish": 60}, headers=headers, json=body)
        response.raise_for_status()
        run = response.json()["data"]
        deadline = asyncio.get_running_loop().time() + settings.request_timeout_seconds
        while run.get("status") in {"READY", "RUNNING"} and asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(5)
            status_response = await client.get(f"https://api.apify.com/v2/actor-runs/{run['id']}", headers=headers)
            status_response.raise_for_status()
            run = status_response.json()["data"]
        if run.get("status") != "SUCCEEDED":
            raise RuntimeError(f"Apify terminou com status {run.get('status')}")
        dataset_id = run.get("defaultDatasetId")
        items_response = await client.get(f"https://api.apify.com/v2/datasets/{dataset_id}/items", headers=headers, params={"clean": "true", "format": "json"})
        items_response.raise_for_status()
        items = items_response.json()
        if items and all(item.get("noResults") is True for item in items if isinstance(item, dict)):
            raise RuntimeError("Apify retornou noResults; verifique o limite/plano da conta")
        return run["id"], items


def _persist(session: Session, profiles: list[TrackedProfile], items: list[dict], collected_at: datetime, target_date: date | None = None) -> int:
    by_username = {profile.username.lower(): profile for profile in profiles}
    current_date = collected_at.astimezone(ZoneInfo(settings.app_timezone)).date()
    first_date = target_date or (current_date - timedelta(days=settings.report_days - 1))
    last_date = target_date or current_date
    saved = 0
    for raw in items:
        data = parse_item(raw)
        if not data["instagram_id"] or not data["url"]:
            continue
        published_date = data["published_at"].astimezone(ZoneInfo(settings.app_timezone)).date() if data["published_at"] else None
        if not published_date or not (first_date <= published_date <= last_date):
            continue
        participants = [data["source_username"], data["owner_username"], *data["collaborators"]]
        item_profiles = []
        for username in participants:
            profile = by_username.get(username or "")
            if profile and all(existing.id != profile.id for existing in item_profiles):
                item_profiles.append(profile)
        if not item_profiles:
            continue
        for profile in item_profiles:
            post = session.scalar(select(InstagramPost).where(InstagramPost.tracked_profile_id == profile.id, InstagramPost.instagram_id == data["instagram_id"]))
            if not post:
                post = InstagramPost(tracked_profile_id=profile.id, **{k: data[k] for k in ("instagram_id", "shortcode", "url", "caption", "published_at", "owner_username", "collaborators", "media_type", "thumbnail_url", "raw_payload")})
                session.add(post)
                session.flush()
            else:
                for key in ("shortcode", "url", "caption", "published_at", "owner_username", "collaborators", "media_type", "thumbnail_url", "raw_payload"):
                    setattr(post, key, data[key])
            latest = session.scalar(select(PostMetricsHistory).where(PostMetricsHistory.post_id == post.id).order_by(PostMetricsHistory.collected_at.desc()).limit(1))
            metrics = (data["likes"], data["comments"], data["views"], data["plays"])
            previous = (latest.likes, latest.comments, latest.views, latest.plays) if latest else None
            if metrics != previous:
                session.add(PostMetricsHistory(post_id=post.id, collected_at=collected_at, likes=metrics[0], comments=metrics[1], views=metrics[2], plays=metrics[3]))
            saved += 1
    for profile in profiles:
        profile.last_sync_at = collected_at
        profile.last_sync_status = "success"
        profile.last_error = None
        profile.sync_provider = "apify"
    return saved


def ingest_items(items: list[dict], target_date: date) -> dict:
    with SessionLocal() as session:
        profiles = list(session.scalars(select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id, TrackedProfile.is_fixed.is_(True))).all())
        now = datetime.now(timezone.utc)
        saved = _persist(session, profiles, items, now, target_date)
        session.commit()
        return {"status": "success", "provider": "apify", "target_date": target_date.isoformat(), "items_received": len(items), "posts_saved": saved}


async def collect(usernames: list[str] | None = None, trigger: str = "manual") -> dict:
    if collection_lock.locked():
        raise RuntimeError("Já existe uma coleta em andamento")
    async with collection_lock:
        with SessionLocal() as session:
            query = select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id, TrackedProfile.is_fixed.is_(True))
            if usernames:
                query = query.where(func.lower(TrackedProfile.username).in_([x.lower() for x in usernames]))
            profiles = list(session.scalars(query.order_by(TrackedProfile.username)).all())
            if not profiles:
                raise LookupError("Nenhum perfil ativo encontrado")
            names = [x.username for x in profiles]
            run = CollectionRun(id=uuid.uuid4(), organization_id=settings.default_organization_id, status="running", trigger=trigger, profiles=names)
            session.add(run)
            for profile in profiles:
                profile.last_sync_status = "pending"
                profile.last_error = None
            session.commit()
            try:
                apify_run_id, items = await _run_actor(names)
                now = datetime.now(timezone.utc)
                run.apify_run_id = apify_run_id
                run.posts_received = _persist(session, profiles, items, now)
                run.status = "success"
                run.finished_at = now
                session.commit()
                return {"run_id": str(run.id), "apify_run_id": apify_run_id, "profiles": names, "posts_received": run.posts_received, "status": "success"}
            except Exception as exc:
                session.rollback()
                run = session.get(CollectionRun, run.id)
                run.status = "error"
                run.error = str(exc)[:2000]
                run.finished_at = datetime.now(timezone.utc)
                for profile in profiles:
                    current = session.get(TrackedProfile, profile.id)
                    current.last_sync_status = "error"
                    current.last_error = str(exc)[:2000]
                session.commit()
                raise


async def collect_profile(profile_id: str) -> dict:
    with SessionLocal() as session:
        profile = session.get(TrackedProfile, profile_id)
        if not profile:
            raise LookupError("Perfil não encontrado")
        username = profile.username
    return await collect([username], "manual")


async def collect_all(organization_id=None) -> dict:
    return await collect(None, "scheduled")
