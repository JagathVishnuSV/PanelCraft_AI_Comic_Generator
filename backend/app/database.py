from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path

# Create database directory if it doesn't exist
db_dir = Path(__file__).parent.parent.parent / "database"
db_dir.mkdir(exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_dir}/storystrip.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize the database by creating all tables."""
    from .models.database import Base  # Import here to avoid circular imports
    Base.metadata.create_all(bind=engine) 