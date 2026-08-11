import re
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class ProfileCreate(BaseModel):
    username: str
    organization_id: UUID | None = None
    created_by: UUID | None = None
    is_fixed: bool = True

    @field_validator("username")
    @classmethod
    def normalize(cls, value: str) -> str:
        value = value.strip().rstrip("/").split("/")[-1].lstrip("@").lower()
        if not re.fullmatch(r"[a-z0-9._]{1,30}", value): raise ValueError("username inválido")
        return value


class ProfileOut(BaseModel):
    id: UUID; username: str; display_name: str | None; profile_url: str
    followers_count: int | None; following_count: int | None; media_count: int | None
    last_sync_at: datetime | None; last_sync_status: str; sync_provider: str | None
    model_config = {"from_attributes": True}

