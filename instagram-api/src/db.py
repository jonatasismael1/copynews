from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from .config import get_settings


class Base(DeclarativeBase):
    pass


url = get_settings().database_url.replace("postgres://", "postgresql+psycopg://", 1)
if url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(url, pool_pre_ping=True, pool_size=3, max_overflow=2)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session

