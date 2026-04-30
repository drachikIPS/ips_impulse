import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./projectmanagement.db")

# Supabase and some PaaS providers give a "postgres://" URL; SQLAlchemy requires
# "postgresql://" for its psycopg2 dialect.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Strip pgbouncer=true — Prisma-specific parameter that psycopg2 rejects.
DATABASE_URL = DATABASE_URL.replace("&pgbouncer=true", "").replace("?pgbouncer=true&", "?").replace("?pgbouncer=true", "")

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # NullPool is required for serverless (Vercel): each request opens and
    # immediately releases its own connection instead of maintaining a pool
    # across short-lived function instances, which would exhaust Supabase's
    # direct-connection limit.
    engine = create_engine(DATABASE_URL, poolclass=NullPool)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
