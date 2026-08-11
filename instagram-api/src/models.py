import uuid
from datetime import date, datetime
from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class TrackedProfile(Base):
    __tablename__ = "tracked_instagram_profiles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    username: Mapped[str] = mapped_column(String)
    display_name: Mapped[str | None] = mapped_column(String)
    profile_url: Mapped[str] = mapped_column(String)
    avatar_url: Mapped[str | None] = mapped_column(String)
    followers_count: Mapped[int | None] = mapped_column(BigInteger)
    following_count: Mapped[int | None] = mapped_column(BigInteger)
    media_count: Mapped[int | None] = mapped_column(BigInteger)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_status: Mapped[str] = mapped_column(String)
    last_error: Mapped[str | None] = mapped_column(Text)
    sync_provider: Mapped[str | None] = mapped_column(String)
    is_fixed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))


class Publication(Base):
    __tablename__ = "publications"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(Text)
    caption: Mapped[str | None] = mapped_column(Text)
    platform: Mapped[str] = mapped_column(String, default="instagram")
    published_url: Mapped[str] = mapped_column(Text)
    external_media_id: Mapped[str | None] = mapped_column(String)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source_type: Mapped[str] = mapped_column(ENUM("copy_news", "external", name="publication_source", create_type=False), default="external")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    tracked_profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tracked_instagram_profiles.id"))


class MetricSnapshot(Base):
    __tablename__ = "metric_snapshots"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    publication_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("publications.id"))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    source: Mapped[str] = mapped_column(ENUM("manual", "api", name="metric_source", create_type=False), default="api")
    views: Mapped[int] = mapped_column(BigInteger, default=0)
    reach: Mapped[int] = mapped_column(BigInteger, default=0)
    impressions: Mapped[int] = mapped_column(BigInteger, default=0)
    likes: Mapped[int] = mapped_column(BigInteger, default=0)
    comments: Mapped[int] = mapped_column(BigInteger, default=0)
    shares: Mapped[int] = mapped_column(BigInteger, default=0)
    saves: Mapped[int] = mapped_column(BigInteger, default=0)
    clicks: Mapped[int] = mapped_column(BigInteger, default=0)
    followers_gained: Mapped[int] = mapped_column(BigInteger, default=0)
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))


class ProfileSnapshot(Base):
    __tablename__ = "instagram_profile_snapshots"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tracked_profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tracked_instagram_profiles.id"))
    followers: Mapped[int] = mapped_column(BigInteger, default=0)
    following: Mapped[int] = mapped_column(BigInteger, default=0)
    media_count: Mapped[int] = mapped_column(BigInteger, default=0)
    provider: Mapped[str] = mapped_column(String)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)


class DailyStats(Base):
    __tablename__ = "instagram_profile_daily_stats"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    tracked_profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    report_date: Mapped[date] = mapped_column(Date)
    posts_count: Mapped[int] = mapped_column(Integer, default=0)
    authored_posts_count: Mapped[int] = mapped_column(Integer, default=0)
    collaborations_count: Mapped[int] = mapped_column(Integer, default=0)
    views: Mapped[int] = mapped_column(BigInteger, default=0)
    likes: Mapped[int] = mapped_column(BigInteger, default=0)
    comments: Mapped[int] = mapped_column(BigInteger, default=0)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)


class InstagramPost(Base):
    __tablename__ = "instagram_posts"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tracked_profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tracked_instagram_profiles.id"))
    instagram_id: Mapped[str] = mapped_column(String)
    shortcode: Mapped[str | None] = mapped_column(String)
    url: Mapped[str] = mapped_column(Text)
    caption: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    owner_username: Mapped[str | None] = mapped_column(String)
    collaborators: Mapped[list] = mapped_column(JSONB, default=list)
    media_type: Mapped[str | None] = mapped_column(String)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)


class PostMetricsHistory(Base):
    __tablename__ = "post_metrics_history"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_posts.id"))
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    likes: Mapped[int | None] = mapped_column(BigInteger)
    comments: Mapped[int | None] = mapped_column(BigInteger)
    views: Mapped[int | None] = mapped_column(BigInteger)
    plays: Mapped[int | None] = mapped_column(BigInteger)


class CollectionRun(Base):
    __tablename__ = "instagram_collection_runs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(String)
    trigger: Mapped[str] = mapped_column(String)
    apify_run_id: Mapped[str | None] = mapped_column(String)
    profiles: Mapped[list] = mapped_column(JSONB, default=list)
    posts_received: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
