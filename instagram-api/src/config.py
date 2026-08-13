from functools import lru_cache
from uuid import UUID
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    api_key: str = Field(min_length=32)
    default_organization_id: UUID
    default_created_by: UUID
    apify_token: str = Field(min_length=20)
    apify_actor_id: str = "apify/instagram-scraper"
    app_timezone: str = "America/Maceio"
    max_posts_per_profile: int = 20
    tracking_days: int = 30
    report_days: int = 7
    request_timeout_seconds: float = 360
    evolution_api_url: str = ""
    evolution_api_key: str = ""
    evolution_instance: str = ""
    instagram_whatsapp_alerts_enabled: bool = False
    instagram_alert_phone: str = ""
    notification_timeout_seconds: float = 8
    notification_max_attempts: int = 3
    notification_message_delay_seconds: float = 1
    alert_low_volume_ratio: float = 0.5
    alert_inactive_hours: float = 4
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()
