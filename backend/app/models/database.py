from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    story_text = Column(String)
    memory_state = Column(String, nullable=True)
    continuation_hook = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    panels = relationship("ComicPanel", back_populates="project")

class ComicPanel(Base):
    __tablename__ = "comic_panels"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    panel_number = Column(Integer)
    scene_description = Column(String)
    panel_text = Column(String, nullable=True)
    image_prompt = Column(String, nullable=True)
    image_url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    project = relationship("Project", back_populates="panels") 