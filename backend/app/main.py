from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from .api.routes import router
from .database import init_db
import os
from pathlib import Path

# Load environment variables
load_dotenv()

app = FastAPI(title="StoryStrip API")

# Configure CORS - allow frontend to access both API and static files
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],  # Frontend URLs
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):3000",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],  # Expose all headers to the frontend
)

# Include the router
app.include_router(router, prefix="/api")

# Mount static files directory to serve images
static_dir = Path(__file__).parent.parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Initialize database
@app.on_event("startup")
async def startup_event():
    init_db()

# Health check endpoint
@app.get("/")
async def read_root():
    return {"status": "healthy", "message": "StoryStrip API is running"} 