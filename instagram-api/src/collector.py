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
from .notifications import WhatsAppNotificationService, safe_error
from .post_classification import apply_classification, classify_post_for_profile, empty_profile_summary, normalize_format, validate_profile_summary

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


def _content_kind(data: dict) -> str:
    return normalize_format(data.get("media_type"), data.get("raw_payload"), data.get("url"))


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


def _persist(session: Session, profiles: list[TrackedProfile], items: list[dict], collected_at: datetime, target_date: date | None = None) -> dict:
    by_username = {profile.username.lower(): profile for profile in profiles}
    current_date = collected_at.astimezone(ZoneInfo(settings.app_timezone)).date()
    first_date = target_date or (current_date - timedelta(days=settings.report_days - 1))
    last_date = target_date or current_date
    stats = {"saved": 0, "found": 0, "new": 0, "updated": 0, "collaborations": 0, "collaborations_made": 0, "collaborations_received": 0, "internal_collaborations": 0, "external_collaborations": 0, "external_details": [], "views": 0, "reels": 0, "posts": 0, "carousels": 0, "posting_times": [], "contents": []}
    profile_summaries = {username: {**empty_profile_summary(username), "_seen": set(), "audit": []} for username in by_username}
    summarized_ids: set[str] = set()
    for raw in items:
        data = parse_item(raw)
        if not data["instagram_id"] or not data["url"]:
            continue
        published_date = data["published_at"].astimezone(ZoneInfo(settings.app_timezone)).date() if data["published_at"] else None
        if not published_date or not (first_date <= published_date <= last_date):
            continue
        if published_date == current_date and data["instagram_id"] not in summarized_ids:
            summarized_ids.add(data["instagram_id"])
            stats["found"] += 1
            stats["views"] += data["views"] or 0
            stats["posting_times"].append(data["published_at"].astimezone(ZoneInfo(settings.app_timezone)).strftime("%H:%M"))
            was_known = session.scalar(select(func.count()).select_from(InstagramPost).where(InstagramPost.instagram_id == data["instagram_id"])) or 0
            stats["updated" if was_known else "new"] += 1
            kind = _content_kind(data)
            if kind == "other":
                raise ValueError(f"Formato não reconhecido no conteúdo {data['shortcode'] or data['instagram_id']}")
            stats[f"{kind}s"] += 1
            owner_username = data["owner_username"] or ""
            tracked_collaborators = {name for name in data["collaborators"] if name in by_username and name != owner_username}
            if owner_username in by_username and data["collaborators"]:
                stats["collaborations_made"] += 1
            if owner_username in by_username and tracked_collaborators:
                stats["internal_collaborations"] += 1
            if owner_username not in by_username and tracked_collaborators:
                stats["external_collaborations"] += 1
                stats["external_details"].extend({"external": owner_username, "profile": name} for name in sorted(tracked_collaborators))
            stats["collaborations_received"] += len(tracked_collaborators)
            stats["contents"].append({
                "key": data["instagram_id"] or data["shortcode"], "instagram_id": data["instagram_id"], "shortcode": data["shortcode"],
                "published_at": data["published_at"].isoformat(), "views": data["views"] or 0, "kind": _content_kind(data),
                "owner": owner_username, "collaborators": data["collaborators"], "profiles": [],
            })
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
            profile_name = profile.username.lower()
            summary = profile_summaries[profile_name]
            if published_date == current_date and data["instagram_id"] not in summary["_seen"]:
                summary["_seen"].add(data["instagram_id"])
                summary["posts_found"] += 1
                summary["posts_updated" if post else "posts_new"] += 1
                summary["views_monitored"] += data["views"] or 0
                classification = classify_post_for_profile(owner_username=data["owner_username"], coowners=data["collaborators"], profile_username=profile_name, monitored_profiles=set(by_username), media_type=data["media_type"], raw_payload=data["raw_payload"], url=data["url"])
                apply_classification(summary, classification)
                summary["posting_times"].append(data["published_at"].astimezone(ZoneInfo(settings.app_timezone)).strftime("%H:%M"))
                summary["audit"].append({"shortcode": data["shortcode"], "owner": data["owner_username"], "coowners": data["collaborators"], "classification": classification})
                content_key = data["instagram_id"] or data["shortcode"]
                content = next((value for value in stats["contents"] if value["key"] == content_key), None)
                if content and profile_name not in content["profiles"]:
                    content["profiles"].append(profile_name)
            if not post:
                post = InstagramPost(tracked_profile_id=profile.id, **{k: data[k] for k in ("instagram_id", "shortcode", "url", "caption", "published_at", "owner_username", "collaborators", "media_type", "thumbnail_url", "raw_payload")})
                session.add(post)
                session.flush()
            else:
                for key in ("shortcode", "url", "caption", "published_at", "owner_username", "collaborators", "media_type", "thumbnail_url", "raw_payload"):
                    setattr(post, key, data[key])
            if data["owner_username"] and data["owner_username"] != profile.username.lower():
                stats["collaborations"] += 1
            latest = session.scalar(select(PostMetricsHistory).where(PostMetricsHistory.post_id == post.id).order_by(PostMetricsHistory.collected_at.desc()).limit(1))
            metrics = (data["likes"], data["comments"], data["views"], data["plays"])
            previous = (latest.likes, latest.comments, latest.views, latest.plays) if latest else None
            if metrics != previous:
                session.add(PostMetricsHistory(post_id=post.id, collected_at=collected_at, likes=metrics[0], comments=metrics[1], views=metrics[2], plays=metrics[3]))
            stats["saved"] += 1
    for profile in profiles:
        profile.last_sync_at = collected_at
        profile.last_sync_status = "success"
        profile.last_error = None
        profile.sync_provider = "apify"
    stats["posting_times"].sort()
    stats["profile_summaries"] = []
    for username in sorted(profile_summaries):
        summary = profile_summaries[username]
        summary["posting_times"].sort()
        summary.pop("_seen", None)
        validate_profile_summary(summary)
        stats["profile_summaries"].append(summary)
    stats["profile_appearances"] = sum(value["posts_found"] for value in stats["profile_summaries"])
    stats["report_payload"] = {"date": current_date.isoformat(), "contents": stats["contents"], "external_collabs": stats["external_details"]}
    return stats


def _profile_failures(items: list[dict], profiles: list[TrackedProfile]) -> list[dict]:
    known = {profile.username.lower() for profile in profiles}
    failures: list[dict] = []
    for item in items:
        error = item.get("error") or item.get("errorDescription")
        if not error:
            continue
        source = str(item.get("inputUrl") or item.get("inputSource") or "").rstrip("/").split("/")[-1].lower()
        if source in known and not any(value["username"] == source for value in failures):
            failures.append({"username": source, "error": safe_error(error)})
    return failures


async def _notify_run(run_id: uuid.UUID) -> None:
    try:
        service = WhatsAppNotificationService()
        with SessionLocal() as session:
            run = session.get(CollectionRun, run_id)
            if not run:
                return
            previous = None
            local_finished = (run.finished_at or run.started_at).astimezone(ZoneInfo(settings.app_timezone))
            if run.trigger == "scheduled" and local_finished.hour >= 20:
                candidates = session.scalars(
                    select(CollectionRun).where(
                        CollectionRun.organization_id == run.organization_id,
                        CollectionRun.id != run.id,
                        CollectionRun.status.in_(["success", "partial"]),
                        CollectionRun.trigger == "scheduled",
                        CollectionRun.finished_at < run.finished_at,
                    ).order_by(CollectionRun.finished_at.desc()).limit(10)
                ).all()
                previous = next((candidate for candidate in candidates if candidate.finished_at.astimezone(ZoneInfo(settings.app_timezone)).date() == local_finished.date() and 13 <= candidate.finished_at.astimezone(ZoneInfo(settings.app_timezone)).hour <= 16), None)
            if run.status == "success":
                result = await service.send_collection_success(run, previous)
            elif run.status == "partial":
                result = await service.send_collection_partial(run, previous)
            else:
                result = await service.send_collection_failure(run)
            run.notification_status = result.status
            run.notification_sent_at = datetime.now(timezone.utc) if result.status == "sent" else None
            run.notification_error = result.error
            session.commit()
    except Exception as exc:
        log.warning("notification failed response_status=internal_error error=%s", safe_error(exc))
        try:
            with SessionLocal() as session:
                run = session.get(CollectionRun, run_id)
                if run:
                    run.notification_status = "failed"
                    run.notification_error = safe_error(exc)
                    session.commit()
        except Exception:
            log.exception("notification status persistence failed")


def ingest_items(items: list[dict], target_date: date) -> dict:
    with SessionLocal() as session:
        profiles = list(session.scalars(select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id, TrackedProfile.is_fixed.is_(True))).all())
        now = datetime.now(timezone.utc)
        stats = _persist(session, profiles, items, now, target_date)
        session.commit()
        return {"status": "success", "provider": "apify", "target_date": target_date.isoformat(), "items_received": len(items), "posts_saved": stats["saved"]}


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
            notification_status = "pending" if settings.instagram_whatsapp_alerts_enabled else "disabled"
            run = CollectionRun(id=uuid.uuid4(), organization_id=settings.default_organization_id, status="running", trigger=trigger, profiles=names, notification_status=notification_status)
            session.add(run)
            for profile in profiles:
                profile.last_sync_status = "pending"
                profile.last_error = None
            session.commit()
            try:
                apify_run_id, items = await _run_actor(names)
                now = datetime.now(timezone.utc)
                run.apify_run_id = apify_run_id
                stats = _persist(session, profiles, items, now)
                failures = _profile_failures(items, profiles)
                failed_names = {item["username"] for item in failures}
                run.profiles_failed = failures
                run.profiles_succeeded = [name for name in names if name.lower() not in failed_names]
                run.posts_received = stats["saved"]
                run.posts_found = stats["found"]
                run.posts_new = stats["new"]
                run.posts_updated = stats["updated"]
                run.collaborations_found = stats["collaborations"]
                run.collaborations_made = stats["collaborations_made"]
                run.collaborations_received = stats["collaborations_received"]
                run.reels_count = stats["reels"]
                run.posts_count = stats["posts"]
                run.carousels_count = stats["carousels"]
                run.posting_times = stats["posting_times"]
                run.profile_summaries = stats["profile_summaries"]
                run.views_monitored = stats["views"]
                run.unique_views = stats["views"]
                run.profile_appearances = stats["profile_appearances"]
                run.internal_collaborations = stats["internal_collaborations"]
                run.external_collaborations = stats["external_collaborations"]
                run.report_payload = stats["report_payload"]
                run.status = "partial" if failures else "success"
                run.finished_at = now
                session.commit()
                result = {"run_id": str(run.id), "apify_run_id": apify_run_id, "profiles": names, "posts_received": run.posts_received, "status": run.status}
                await _notify_run(run.id)
                return result
            except Exception as exc:
                session.rollback()
                run = session.get(CollectionRun, run.id)
                run.status = "error"
                run.error = safe_error(exc, 1000)
                run.profiles_failed = [{"username": name, "error": safe_error(exc)} for name in names]
                run.profiles_succeeded = []
                run.finished_at = datetime.now(timezone.utc)
                for profile in profiles:
                    current = session.get(TrackedProfile, profile.id)
                    current.last_sync_status = "error"
                    current.last_error = safe_error(exc, 1000)
                session.commit()
                await _notify_run(run.id)
                raise


async def collect_profile(profile_id: str) -> dict:
    with SessionLocal() as session:
        profile = session.get(TrackedProfile, profile_id)
        if not profile:
            raise LookupError("Perfil não encontrado")
        username = profile.username
    return await collect([username], "manual")


async def collect_all(organization_id=None, trigger: str = "scheduled") -> dict:
    return await collect(None, trigger)
