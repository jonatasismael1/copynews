import logging, secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from uuid import uuid4
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from sqlalchemy import desc, func, select, text
from sqlalchemy.orm import Session
from .collector import collect_all, collect_profile, ingest_items
from .config import get_settings
from .db import engine, get_db
from .models import CollectionRun, InstagramPost, MetricSnapshot, PostMetricsHistory, ProfileSnapshot, Publication, TrackedProfile
from .notifications import WhatsAppNotificationService
from .schemas import ProfileCreate, ProfileOut

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
settings = get_settings(); scheduler = AsyncIOScheduler(timezone=settings.app_timezone)


async def scheduled_collection():
    await collect_all()


@asynccontextmanager
async def lifespan(_: FastAPI):
    for hour in (14, 21): scheduler.add_job(scheduled_collection, "cron", hour=hour, minute=0, id=f"collect-{hour}", max_instances=1, coalesce=True)
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Copy News Instagram Analytics", version="2.3.0", lifespan=lifespan)


def authorize(x_api_key: str | None = Header(default=None)):
    if settings.api_key and (not x_api_key or not secrets.compare_digest(x_api_key, settings.api_key)):
        raise HTTPException(status_code=401, detail="API key inválida")


async def queue_collect(profile_id: str):
    await collect_profile(profile_id)


async def queue_collect_all():
    await collect_all(settings.default_organization_id, trigger="manual")


@app.get("/health")
def health():
    try:
        with engine.connect() as conn: conn.execute(text("select 1"))
        database = "ok"
    except Exception: database = "error"
    return {"status": "ok" if database == "ok" else "degraded", "database": database, "scheduler": scheduler.running, "schedule": ["14:00", "21:00"], "timezone": settings.app_timezone, "time": datetime.now(timezone.utc)}


@app.get("/profiles", response_model=list[ProfileOut], dependencies=[Depends(authorize)])
def profiles(db: Session = Depends(get_db)):
    return db.scalars(select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id).order_by(TrackedProfile.username)).all()


@app.post("/profiles", response_model=ProfileOut, status_code=201, dependencies=[Depends(authorize)])
def add_profile(body: ProfileCreate, db: Session = Depends(get_db)):
    org = body.organization_id or settings.default_organization_id; creator = body.created_by or settings.default_created_by
    existing = db.scalar(select(TrackedProfile).where(TrackedProfile.organization_id == org, func.lower(TrackedProfile.username) == body.username))
    if existing: return existing
    item = TrackedProfile(id=uuid4(), organization_id=org, username=body.username, display_name=None, profile_url=f"https://www.instagram.com/{body.username}/", avatar_url=None, followers_count=None, following_count=None, media_count=None, last_sync_at=None, last_sync_status="pending", last_error=None, sync_provider=None, is_fixed=body.is_fixed, created_by=creator)
    db.add(item); db.commit(); db.refresh(item); return item


@app.post("/profiles/{username}/refresh", status_code=202, dependencies=[Depends(authorize)])
def refresh(username: str, background: BackgroundTasks, db: Session = Depends(get_db)):
    item = db.scalar(select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id, func.lower(TrackedProfile.username) == username.lower()))
    if not item: raise HTTPException(404, "Perfil não encontrado")
    item.last_sync_status = "pending"; db.commit(); background.add_task(queue_collect, str(item.id))
    return {"accepted": True, "profile_id": item.id}


@app.get("/profiles/{username}/analytics", dependencies=[Depends(authorize)])
def analytics(username: str, limit: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    item = db.scalar(select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id, func.lower(TrackedProfile.username) == username.lower()))
    if not item: raise HTTPException(404, "Perfil não encontrado")
    snapshots = db.scalars(select(ProfileSnapshot).where(ProfileSnapshot.tracked_profile_id == item.id).order_by(desc(ProfileSnapshot.collected_at)).limit(limit)).all()
    return {"profile": ProfileOut.model_validate(item), "snapshots": [{"followers": x.followers, "following": x.following, "media_count": x.media_count, "provider": x.provider, "collected_at": x.collected_at} for x in snapshots]}


@app.get("/posts/{shortcode}/snapshots", dependencies=[Depends(authorize)])
def post_snapshots(shortcode: str, limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    post = db.scalar(
        select(Publication)
        .join(TrackedProfile, TrackedProfile.id == Publication.tracked_profile_id)
        .where(
            TrackedProfile.organization_id == settings.default_organization_id,
            Publication.published_url.contains(f"/{shortcode}/"),
        )
    )
    if not post: raise HTTPException(404, "Publicação não encontrada")
    rows = db.scalars(select(MetricSnapshot).where(MetricSnapshot.publication_id == post.id).order_by(desc(MetricSnapshot.captured_at)).limit(limit)).all()
    return {"shortcode": shortcode, "snapshots": [{"likes": x.likes, "comments": x.comments, "views": x.views, "collected_at": x.captured_at} for x in rows]}


@app.post("/collect/all", status_code=202, dependencies=[Depends(authorize)])
def trigger_all(background: BackgroundTasks):
    background.add_task(queue_collect_all); return {"accepted": True}


@app.post("/instagram/collect", status_code=202, dependencies=[Depends(authorize)])
def instagram_collect(background: BackgroundTasks):
    background.add_task(queue_collect_all)
    return {"accepted": True, "provider": "apify"}


@app.get("/instagram/runs", dependencies=[Depends(authorize)])
def collection_runs(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.scalars(select(CollectionRun).where(CollectionRun.organization_id == settings.default_organization_id).order_by(desc(CollectionRun.started_at)).limit(limit)).all()
    return [{"id": x.id, "status": x.status, "trigger": x.trigger, "apify_run_id": x.apify_run_id, "profiles": x.profiles, "profiles_succeeded": x.profiles_succeeded, "profiles_failed": x.profiles_failed, "profile_summaries": x.profile_summaries, "posts_received": x.posts_received, "posts_found": x.posts_found, "posts_new": x.posts_new, "posts_updated": x.posts_updated, "collaborations_found": x.collaborations_found, "collaborations_made": x.collaborations_made, "collaborations_received": x.collaborations_received, "views_monitored": x.views_monitored, "reels_count": x.reels_count, "posts_count": x.posts_count, "carousels_count": x.carousels_count, "posting_times": x.posting_times, "notification_status": x.notification_status, "notification_sent_at": x.notification_sent_at, "notification_error": x.notification_error, "error": x.error, "started_at": x.started_at, "finished_at": x.finished_at} for x in rows]


@app.post("/admin/notifications/test", dependencies=[Depends(authorize)])
async def test_notification():
    result = await WhatsAppNotificationService().send_test()
    if result.status == "failed":
        raise HTTPException(502, result.error or "Falha no envio da notificação")
    return {"status": result.status}


@app.get("/instagram/profiles/{username}/posts", dependencies=[Depends(authorize)])
def instagram_posts(username: str, limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    profile = db.scalar(select(TrackedProfile).where(TrackedProfile.organization_id == settings.default_organization_id, func.lower(TrackedProfile.username) == username.lower()))
    if not profile:
        raise HTTPException(404, "Perfil não encontrado")
    posts = db.scalars(select(InstagramPost).where(InstagramPost.tracked_profile_id == profile.id).order_by(desc(InstagramPost.published_at)).limit(limit)).all()
    result = []
    for post in posts:
        metric = db.scalar(select(PostMetricsHistory).where(PostMetricsHistory.post_id == post.id).order_by(desc(PostMetricsHistory.collected_at)).limit(1))
        result.append({"id": post.id, "instagram_id": post.instagram_id, "shortcode": post.shortcode, "url": post.url, "caption": post.caption, "published_at": post.published_at, "owner_username": post.owner_username, "collaborators": post.collaborators, "media_type": post.media_type, "thumbnail_url": post.thumbnail_url, "metrics": None if not metric else {"likes": metric.likes, "comments": metric.comments, "views": metric.views, "plays": metric.plays, "collected_at": metric.collected_at}})
    return {"profile": username.lower(), "posts": result}


@app.get("/instagram/posts/{shortcode}/history", dependencies=[Depends(authorize)])
def instagram_post_history(shortcode: str, limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    post = db.scalar(select(InstagramPost).join(TrackedProfile, TrackedProfile.id == InstagramPost.tracked_profile_id).where(TrackedProfile.organization_id == settings.default_organization_id, InstagramPost.shortcode == shortcode))
    if not post:
        raise HTTPException(404, "Publicação não encontrada")
    rows = db.scalars(select(PostMetricsHistory).where(PostMetricsHistory.post_id == post.id).order_by(desc(PostMetricsHistory.collected_at)).limit(limit)).all()
    return {"shortcode": shortcode, "history": [{"likes": x.likes, "comments": x.comments, "views": x.views, "plays": x.plays, "collected_at": x.collected_at} for x in rows]}


@app.post("/instagram/ingest", dependencies=[Depends(authorize)])
def instagram_ingest(items: list[dict], target_date: date = Query(...)):
    if len(items) > 1000:
        raise HTTPException(413, "Máximo de 1000 itens por importação")
    return ingest_items(items, target_date)
