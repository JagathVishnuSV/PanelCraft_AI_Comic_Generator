# PanelCraft: AI Comic Generator

Transform your stories into visually engaging comic strips using AI technology. PanelCraft automatically analyzes your narrative, breaks it down into panels, and generates custom illustrations to bring your stories to life.

## Features

- **Text-to-Comic Conversion**: Convert any text story into a multi-panel comic strip
- **AI-Powered Scene Analysis**: Intelligent breakdown of narrative into logical comic panels
- **Custom Illustrations**: Generate high-quality comic panels with Gemini image models first, then AI Horde + Pollinations fallback
- **Panel Text Generation**: Automatically extracts or generates appropriate text for each panel
- **Export Options**: Save your comics as images or PDF files
- **Project Management**: Save, view, and edit your comic projects

## Tech Stack
 
### Frontend
- **Framework**: Next.js 15.3.0 with Turbopack
- **UI Library**: React 19.0.0
- **Styling**: TailwindCSS
- **Export Utilities**: html2canvas, jspdf

### Backend
- **API Framework**: FastAPI 0.104.1
- **Server**: Uvicorn 0.24.0
- **Database ORM**: SQLAlchemy 2.0.23
- **Database**: SQLite
- **AI Integration**: Groq (text primary), Gemini (text fallback + image primary), AI Horde (image fallback), plus Pollinations fallback
- **Authentication**: Python-JOSE, Passlib, Bcrypt

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- Python (v3.8 or higher)
- Groq API key (for text generation)
- Gemini API key (text fallback + image generation)

### Installation

#### Manual Setup

1. Clone the repository:
```bash
git clone https://github.com/HattoriHanzo16/panelcraft.git
cd panelcraft
```

2. Frontend setup:
```bash
cd frontend
npm install
npm run dev
```

3. Backend setup:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
```

4. Set up environment variables (backend):
- Create a `.env` file in the backend directory
- Required:
```
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
```
- Optional overrides (comma-separated fallbacks allowed):
```
GROQ_TEXT_MODELS=llama-3.3-70b-versatile,llama-3.1-8b-instant,mixtral-8x7b-32768
GEMINI_TEXT_MODELS=gemini-2.0-flash,gemini-1.5-flash
GEMINI_IMAGE_MODELS=gemini-3.1-flash-image-preview,gemini-2.5-flash-image
GROQ_IMAGE_MODELS=
AIHORDE_API_KEY=0000000000
AIHORDE_MODELS=DreamShaper XL,JuggernautXL,Anything Diffusion
AIHORDE_MODEL_PREFERENCES=DreamShaper XL,JuggernautXL,Anything Diffusion
AIHORDE_IMAGE_WIDTH=768
AIHORDE_IMAGE_HEIGHT=1152
AIHORDE_STEPS=30
AIHORDE_CFG_SCALE=7.5
AIHORDE_SAMPLER_NAME=k_euler_a
AIHORDE_NEGATIVE_PROMPT=nsfw,nude,nudity,explicit,sexual content,gore,graphic violence,watermark,text,logo,blurry,lowres
AIHORDE_POLL_SECONDS=2.5
AIHORDE_TIMEOUT_SECONDS=90
```
5. Run the backend server:
```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend env (optional): create `frontend/.env.local` and set
```
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

#### Using Makefile (Recommended)

A Makefile is provided to simplify setup and running processes:

```bash
# Set up both frontend and backend
make setup

# Run both servers simultaneously
make run

# Other useful commands
make stop     # Stop all running servers
make clean    # Clean up generated files and dependencies
```

For more options, run `make help` to see all available commands.

## Usage

1. Start both the frontend and backend servers using the instructions above
2. Open your browser and navigate to http://localhost:3000
3. Enter your story title and text in the provided form
4. Click "Generate Comic" to process your story
5. View, download, or share your generated comic

## Project Structure

```
panelcraft/
├── frontend/                # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js app router pages
│   │   └── components/      # React components
│   ├── public/              # Static assets
│   └── package.json         # Frontend dependencies
├── backend/                 # FastAPI backend application
│   ├── app/
│   │   ├── api/             # API endpoints
│   │   ├── models/          # Data models
│   │   ├── services/        # Business logic services
│   │   ├── database.py      # Database connection setup
│   │   └── main.py          # Application entry point
│   ├── requirements.txt     # Backend dependencies
│   └── .env                 # Environment variables (create this file)
└── database/                # SQLite database files
    └── panelcraft.db          # Main database file
```

## API Endpoints

- `POST /api/generate-comic/`: Generate a new comic from story text
- `GET /api/projects/`: List all comic projects
- `GET /api/projects/{project_id}`: Get details for a specific project

## Model choices (defaults)

- **Text (story-to-panels)**: Groq chat models first, Gemini text models fallback.
- **Image (panel art)**: Gemini image models first for quality (when `GEMINI_API_KEY` is set).
- **Image fallback**: AI Horde safe model pool with tuned generation settings.
- **Final fallback**: Pollinations (no key) is used if Gemini and AI Horde fail.
- **Safety handling**: prompts are auto-sanitized and retried with stricter SFW wording when providers flag policy/NSFW content.

Configuration env vars: `GROQ_TEXT_MODELS`, `GEMINI_TEXT_MODELS`, `GEMINI_IMAGE_MODELS`, `AIHORDE_API_KEY`, `AIHORDE_MODELS`, `AIHORDE_MODEL_PREFERENCES`, `AIHORDE_IMAGE_WIDTH`, `AIHORDE_IMAGE_HEIGHT`, `AIHORDE_STEPS`, `AIHORDE_CFG_SCALE`, `AIHORDE_SAMPLER_NAME`, `AIHORDE_NEGATIVE_PROMPT`, `AIHORDE_POLL_SECONDS`, `AIHORDE_TIMEOUT_SECONDS`, `GROQ_IMAGE_MODELS`.

## Acknowledgments

- Built with FastAPI, Next.js, Groq, AI Horde, Gemini, and free image fallbacks
- Inspired by the intersection of storytelling and visual arts 