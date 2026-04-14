import os
import io
import json
import re
import time
import random
import uuid
import hashlib
from urllib.parse import quote_plus
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
import requests
from openai import OpenAI
from google import genai
from google.genai import types

# Get the absolute path to the .env file
env_path = Path(__file__).parent.parent.parent / '.env'

# Load the environment variables from the specific path
load_dotenv(dotenv_path=env_path)

# Provider configuration
groq_api_key = os.getenv("GROQ_API_KEY")
gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
aihorde_api_key = os.getenv("AIHORDE_API_KEY", "0000000000")
AIHORDE_MODELS = [m.strip() for m in os.getenv("AIHORDE_MODELS", "").split(",") if m.strip()]
AIHORDE_MODEL_PREFERENCES = [m.strip() for m in os.getenv(
    "AIHORDE_MODEL_PREFERENCES",
    "AlbedoBase XL (SDXL),DreamShaper XL,JuggernautXL"
).split(",") if m.strip()]
AIHORDE_POLL_SECONDS = float(os.getenv("AIHORDE_POLL_SECONDS", "2.5"))
AIHORDE_TIMEOUT_SECONDS = int(os.getenv("AIHORDE_TIMEOUT_SECONDS", "90"))
AIHORDE_IMAGE_WIDTH = int(os.getenv("AIHORDE_IMAGE_WIDTH", "768"))
AIHORDE_IMAGE_HEIGHT = int(os.getenv("AIHORDE_IMAGE_HEIGHT", "1152"))
AIHORDE_STEPS = int(os.getenv("AIHORDE_STEPS", "24"))
AIHORDE_CFG_SCALE = float(os.getenv("AIHORDE_CFG_SCALE", "7.5"))
AIHORDE_SAMPLER_NAME = os.getenv("AIHORDE_SAMPLER_NAME", "k_euler_a")
AIHORDE_POST_PROCESSORS = [m.strip() for m in os.getenv(
    "AIHORDE_POST_PROCESSORS",
    "4x_AnimeSharp"
).split(",") if m.strip()]
AIHORDE_NEGATIVE_PROMPT = os.getenv(
    "AIHORDE_NEGATIVE_PROMPT",
    "nsfw, nude, nudity, explicit, sexual content, fetish, porn, gore, graphic violence, blood, "
    "watermark, logo, signature, text, lowres, blurry, jpeg artifacts, deformed anatomy"
)
GROQ_TEXT_MODEL_CANDIDATES = [m.strip() for m in os.getenv(
    "GROQ_TEXT_MODELS",
    "llama-3.3-70b-versatile,llama-3.1-8b-instant,mixtral-8x7b-32768"
).split(",") if m.strip()]
GEMINI_TEXT_MODEL_CANDIDATES = [m.strip() for m in os.getenv(
    "GEMINI_TEXT_MODELS",
    "gemini-2.0-flash,gemini-1.5-flash"
).split(",") if m.strip()]
GEMINI_IMAGE_MODEL_CANDIDATES = [m.strip() for m in os.getenv(
    "GEMINI_IMAGE_MODELS",
    "gemini-3.1-flash-image-preview,gemini-3-pro-image-preview,gemini-2.5-flash-image"
).split(",") if m.strip()]
GEMINI_IMAGE_ENABLED = os.getenv("GEMINI_IMAGE_ENABLED", "true").strip().lower() in ("1", "true", "yes", "on")
GROQ_IMAGE_MODEL_CANDIDATES = [m.strip() for m in os.getenv(
    "GROQ_IMAGE_MODELS",
    ""
).split(",") if m.strip()]
TARGET_IMAGE_WIDTH = int(os.getenv("TARGET_IMAGE_WIDTH", "1024"))
TARGET_IMAGE_HEIGHT = int(os.getenv("TARGET_IMAGE_HEIGHT", "1536"))

# Some AI Horde API keys reject filtered model requests. Disable model filters
# after the first 403 to avoid repeated noisy retries for every panel.
AIHORDE_MODEL_FILTER_ENABLED = True
AIHORDE_PROVIDER_ENABLED = True

if not groq_api_key:
    raise ValueError(f"GROQ_API_KEY not found in environment variables. Looked in: {env_path}")

# Shared clients
# Text: Groq OpenAI-compatible endpoint
text_client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=groq_api_key,
)

# Gemini client (optional)
genai_client = None
if gemini_api_key:
    genai_client = genai.Client(api_key=gemini_api_key)

GEMINI_IMAGE_PROVIDER_ENABLED = bool(genai_client) and GEMINI_IMAGE_ENABLED

# Create images directory if it doesn't exist
IMAGES_DIR = Path(__file__).parent.parent.parent / 'static' / 'images'
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# Base URL for accessing saved images
BASE_IMAGE_URL = "/static/images/"

NSFW_POLICY_TERMS = (
    "nsfw",
    "adult",
    "sexual",
    "explicit",
    "content not allowed",
    "policy",
    "safety",
    "moderation",
    "blocked",
    "disallowed",
)

UNSAFE_PROMPT_REPLACEMENTS = {
    r"\bnude\b": "fully clothed",
    r"\bnudity\b": "fully clothed",
    r"\bnaked\b": "fully clothed",
    r"\btopless\b": "fully clothed",
    r"\bsex\b": "romantic tension",
    r"\bsexual\b": "romantic",
    r"\berotic\b": "dramatic",
    r"\bporn\b": "comic",
    r"\bfetish\b": "stylized",
    r"\bgore\b": "non-graphic action",
    r"\bdisembowel\w*\b": "action",
    r"\bdecapitat\w*\b": "battle",
    r"\bsevered\b": "damaged",
    r"\bgraphic violence\b": "action scene",
}

class StoryService:
    @staticmethod
    def analyze_story(story_text: str, genre: str, mood: str, style: str, memory_state: str = None) -> Dict:
        """Analyze story text into panel descriptions and text using Groq, then Gemini fallback."""
        
        memory_context = ""
        if memory_state:
            memory_context = f"\nPREVIOUS MEMORY STATE (Use this to maintain continuity):\n{memory_state}\n"

        system_prompt = f"""You are a professional comic book writer, cinematic storyteller, and visual art director.
Your job is to transform existing text into a high-quality, genre-accurate, emotionally engaging comic script with perfectly aligned image prompts.

OBJECTIVE:
Improve the provided story by making it crisp, intense, and genre-focused. Strengthen characters, conflict, stakes, and emotional depth. Structure it into 8-10 comic panels. Generate highly specific visual prompts for each panel. Maintain narrative memory for future continuation. Prepare a clear hook for the next episode.

INPUT CONTEXT:
- Genre: {genre}
- Mood: {mood}
- Style Preference: {style}
- Number of Panels: 8-10{memory_context}

OUTPUT FORMAT (STRICT JSON):
You MUST return a valid JSON object with the following structure:
{{
  "analysis": "Step 1: Analyze original story weaknesses.",
  "rewritten_story": "Step 2: Rewrite with stronger conflict.",
  "panels": [
    {{
      "panel_number": 1,
      "scene_description": "1-2 strong cinematic sentences",
      "dialogue": "Character dialogue (if any)",
      "caption": "Narrator caption (if needed)",
      "emotional_tone": "Tone of the panel",
      "image_prompt": "Ultra-detailed comic panel illustration, [environment], [character details], [lighting], [camera angle], {style}, [color palette]"
    }}
  ],
  "memory_state": {{
    "character_profiles": "Appearance, personality, goals",
    "current_conflict": "Main tension",
    "world_rules": "Key rules of the setting",
    "unresolved_threads": "Plot points to address later",
    "emotional_arc_status": "Where characters are emotionally"
  }},
  "continuation_hook": "A strong cliffhanger for the next episode."
}}

Force yourself into a multi-step reasoning pipeline:
Step 1 - Analyze original story weaknesses.
Step 2 - Rewrite with stronger conflict.
Step 3 - Convert into panel script.
Step 4 - Generate image prompts.
Step 5 - Update memory object.
Step 6 - Output hook.
"""
        messages = [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": "Story:\n" + story_text,
            },
        ]

        last_error = None
        for model_id in GROQ_TEXT_MODEL_CANDIDATES:
            for attempt in range(3):
                try:
                    raw_response = text_client.chat.completions.create(
                        model=model_id,
                        messages=messages,
                        max_tokens=2000,
                        temperature=0.3,
                        response_format={"type": "json_object"},
                    )
                    content = raw_response.choices[0].message.content if raw_response and raw_response.choices else ""
                    structured_data = StoryService._parse_json_safely(content)
                    
                    print(f"DEBUG: Parsed data from {model_id} successfully.")

                    if not structured_data.get("panels") or not isinstance(structured_data.get("panels"), list):
                        raise ValueError("Failed to parse panels from LLM response.")

                    return structured_data
                except Exception as e:
                    last_error = e
                    is_rate = "429" in str(e) or "rate limit" in str(e).lower()
                    if is_rate and attempt < 2:
                        delay = 1.5 * (2 ** attempt) + random.uniform(0, 0.5)
                        print(f"Rate limit on {model_id}, retrying in {delay:.2f}s (attempt {attempt+1}/3)")
                        time.sleep(delay)
                        continue
                    print(f"Model {model_id} failed on attempt {attempt+1}: {e}")
                    break  # move to next model

        # Fallback text provider: Gemini
        if genai_client:
            for model_id in GEMINI_TEXT_MODEL_CANDIDATES:
                for attempt in range(2):
                    try:
                        combined_prompt = (
                            f"{system_prompt}\n\n"
                            f"Return strictly valid JSON only. Story:\n{story_text}"
                        )
                        res = genai_client.models.generate_content(
                            model=model_id,
                            contents=combined_prompt,
                            config=types.GenerateContentConfig(
                                temperature=0.3,
                                max_output_tokens=2000,
                                response_mime_type="application/json",
                            )
                        )
                        content = (res.text or "") if res else ""
                        structured_data = StoryService._parse_json_safely(content)
                        print(f"DEBUG: Parsed data from Gemini fallback {model_id} successfully.")

                        if not structured_data.get("panels") or not isinstance(structured_data.get("panels"), list):
                            raise ValueError("Failed to parse panels from Gemini response.")

                        return structured_data
                    except Exception as e:
                        last_error = e
                        is_rate = "429" in str(e) or "rate limit" in str(e).lower() or "resource_exhausted" in str(e).lower()
                        if is_rate and attempt < 1:
                            delay = 1.25 * (2 ** attempt) + random.uniform(0, 0.5)
                            print(f"Rate limit on Gemini text {model_id}, retrying in {delay:.2f}s (attempt {attempt+1}/2)")
                            time.sleep(delay)
                            continue
                        print(f"Gemini text model {model_id} failed on attempt {attempt+1}: {e}")
                        break

        raise Exception(f"All text models failed. Last error: {last_error}")

    @staticmethod
    def generate_panel(visual_description: str) -> str: 
        """Generate a high-quality, SFW comic panel with resilient provider fallbacks."""
        safe_prompt = StoryService._build_quality_comic_prompt(visual_description)
        enhanced_prompt = StoryService._enhance_image_prompt_with_groq(safe_prompt)
        prompt_variants = StoryService._build_prompt_variants(enhanced_prompt)
        last_error = None

        # Prompt-level cache: avoids hammering free providers for repeated prompts
        cache_filename = StoryService._prompt_cache_filename(prompt_variants[0])
        cache_path = IMAGES_DIR / cache_filename
        if cache_path.exists():
            return f"{BASE_IMAGE_URL}{cache_filename}"

        # Groq does not currently expose text-to-image generation endpoints.
        # If user configured GROQ_IMAGE_MODELS, we log and continue with supported providers.
        if GROQ_IMAGE_MODEL_CANDIDATES:
            print("INFO: GROQ_IMAGE_MODELS set, but Groq image generation API is not available. Using Gemini/fallback providers.")

        for variant_idx, prompt_variant in enumerate(prompt_variants, start=1):
            if variant_idx > 1:
                print("INFO: Retrying image generation with stricter SFW prompt variant.")

            # Quality-first provider: Gemini native image generation
            if GEMINI_IMAGE_PROVIDER_ENABLED:
                try:
                    gemini_image = StoryService._generate_with_gemini_image(prompt_variant)
                    if gemini_image is not None:
                        return StoryService.save_generated_image(gemini_image, filename=cache_filename)
                except Exception as e:
                    last_error = e
                    print(f"Gemini image generation failed: {str(e) or repr(e)}")

            # Free provider: AI Horde community SD/SDXL workers
            try:
                horde_image = StoryService._generate_with_aihorde(prompt_variant)
                if horde_image is not None:
                    return StoryService.save_generated_image(horde_image, filename=cache_filename)
            except Exception as e:
                last_error = e
                print(f"AI Horde generation failed: {str(e) or repr(e)}")

            # Final free fallback: Pollinations variants
            fallback_urls = StoryService._build_free_fallback_urls(prompt_variant)
            for idx, fallback_url in enumerate(fallback_urls, start=1):
                try:
                    print(f"DEBUG: Free fallback URL #{idx}: {fallback_url}")
                    response = requests.get(fallback_url, timeout=45)
                    response.raise_for_status()

                    content_type = (response.headers.get("Content-Type") or "").lower()
                    if "image" not in content_type:
                        body_text = (response.text or "")[:300]
                        if StoryService._is_policy_or_nsfw_error(body_text):
                            raise RuntimeError(f"Fallback provider safety block: {body_text}")
                        raise RuntimeError(f"Unexpected fallback response content-type: {content_type}")

                    from PIL import Image
                    image = Image.open(io.BytesIO(response.content))
                    image.load()
                    return StoryService.save_generated_image(image, filename=cache_filename)
                except Exception as e:
                    last_error = e
                    is_rate = "429" in str(e) or "rate limit" in str(e).lower()
                    is_server = "500" in str(e) or "502" in str(e) or "503" in str(e)
                    if is_rate or is_server:
                        delay = 1.25 + random.uniform(0, 0.75)
                        print(f"Fallback provider temporary failure, retrying in {delay:.2f}s")
                        time.sleep(delay)
                        try:
                            retry_res = requests.get(fallback_url, timeout=45)
                            retry_res.raise_for_status()
                            retry_content_type = (retry_res.headers.get("Content-Type") or "").lower()
                            if "image" in retry_content_type:
                                from PIL import Image
                                retry_img = Image.open(io.BytesIO(retry_res.content))
                                retry_img.load()
                                return StoryService.save_generated_image(retry_img, filename=cache_filename)
                        except Exception as retry_error:
                            last_error = retry_error
                    print(f"Free fallback URL #{idx} failed: {str(e) or repr(e)}")

        print(f"All image models failed. Last error: {str(last_error) or repr(last_error)}")
        return BASE_IMAGE_URL + "placeholder-error.png"

    @staticmethod
    def _build_quality_comic_prompt(visual_description: str) -> str:
        """Create a style-stable, quality-oriented prompt for comic panel generation."""
        raw_desc = (visual_description or "A dramatic comic scene").strip().replace("\n", " ")
        cleaned_desc = StoryService._sanitize_prompt_for_sfw(raw_desc[:700])
        return (
            "Single comic panel illustration, professional line art, clean ink, rich cel-shading, "
            "dynamic cinematic framing, consistent character design, detailed background, high contrast color palette, "
            "crisp focus, ultra-detailed, safe-for-work, fully clothed characters, "
            "no blurry output, no text, no speech bubbles, no watermark. "
            f"Scene: {cleaned_desc}"
        )

    @staticmethod
    def _build_prompt_variants(prompt: str) -> List[str]:
        """Create progressively stricter prompt variants for policy-safe retries."""
        first = StoryService._sanitize_prompt_for_sfw(prompt)
        strict = (
            StoryService._sanitize_prompt_for_sfw(prompt) +
            " Keep everything strictly safe-for-work, fully clothed, non-sexual, and non-graphic."
        )
        pg13 = (
            StoryService._sanitize_prompt_for_sfw(prompt) +
            " Keep this PG-13 comic style with no erotic cues and no graphic violence."
        )

        variants = [first]
        for candidate in (strict, pg13):
            if candidate not in variants:
                variants.append(candidate)
        return variants

    @staticmethod
    def _sanitize_prompt_for_sfw(prompt: str) -> str:
        """Normalize prompt terms that commonly trigger image provider safety filters."""
        cleaned = prompt
        for pattern, replacement in UNSAFE_PROMPT_REPLACEMENTS.items():
            cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    @staticmethod
    def _is_policy_or_nsfw_error(text: str) -> bool:
        lower_text = (text or "").lower()
        return any(term in lower_text for term in NSFW_POLICY_TERMS)

    @staticmethod
    def _generate_with_gemini_image(prompt: str):
        """Generate an image with Gemini native image models when API key is available."""
        global GEMINI_IMAGE_PROVIDER_ENABLED

        if not GEMINI_IMAGE_PROVIDER_ENABLED:
            raise RuntimeError("Gemini image provider disabled")

        if not genai_client:
            raise RuntimeError("Gemini image client unavailable")

        last_error = None
        for model_id in GEMINI_IMAGE_MODEL_CANDIDATES:
            config_candidates = StoryService._build_gemini_image_config_candidates(model_id)

            for config_idx, config in enumerate(config_candidates, start=1):
                for attempt in range(2):
                    try:
                        response = StoryService._invoke_gemini_generate_content(
                            model_id=model_id,
                            prompt=prompt,
                            config=config,
                        )
                        image = StoryService._extract_image_from_gemini_response(response)
                        if image is not None:
                            return image

                        diagnostic = StoryService._extract_text_from_gemini_response(response)
                        if StoryService._is_policy_or_nsfw_error(diagnostic):
                            raise RuntimeError(f"Gemini policy block: {diagnostic[:220]}")
                        raise RuntimeError(f"Gemini returned no image for model {model_id}: {diagnostic[:220]}")
                    except Exception as e:
                        error_text = str(e).lower()
                        if "api_key_invalid" in error_text or "api key not valid" in error_text:
                            GEMINI_IMAGE_PROVIDER_ENABLED = False
                            raise RuntimeError("Gemini API key invalid; disabling Gemini image provider") from e

                        last_error = e
                        is_retryable = (
                            "429" in str(e)
                            or "rate limit" in str(e).lower()
                            or "resource_exhausted" in str(e).lower()
                            or "internal" in str(e).lower()
                        )
                        if is_retryable and attempt < 1:
                            delay = 1.25 * (2 ** attempt) + random.uniform(0, 0.5)
                            time.sleep(delay)
                            continue
                        print(
                            f"Gemini image model {model_id} failed on config {config_idx} "
                            f"attempt {attempt + 1}: {e}"
                        )
                        break

        raise RuntimeError(f"Gemini image generation failed. Last error: {last_error}")

    @staticmethod
    def _build_gemini_image_config_candidates(model_id: str) -> List[Any]:
        """Build config fallbacks compatible with multiple google-genai SDK versions."""
        candidates: List[Any] = []

        # Preferred path for SDKs that expose both GenerateContentConfig and ImageConfig.
        image_config_cls = getattr(types, "ImageConfig", None)
        if image_config_cls is not None:
            try:
                image_kwargs: Dict[str, Any] = {"aspect_ratio": "3:4"}
                if "2.5-flash-image" not in model_id:
                    image_kwargs["image_size"] = "2K"
                candidates.append(
                    types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=image_config_cls(**image_kwargs),
                    )
                )
            except Exception:
                pass

        # Widely-supported typed config fallback.
        try:
            candidates.append(types.GenerateContentConfig(response_modalities=["IMAGE"]))
        except Exception:
            pass

        # Dict-based fallback for SDK versions with different typed classes.
        candidates.append({"response_modalities": ["IMAGE"]})

        # Last fallback: rely on prompt-only generation with no explicit config.
        candidates.append(None)
        return candidates

    @staticmethod
    def _invoke_gemini_generate_content(model_id: str, prompt: str, config: Any):
        request_kwargs: Dict[str, Any] = {
            "model": model_id,
            "contents": [prompt],
        }
        if config is not None:
            request_kwargs["config"] = config
        return genai_client.models.generate_content(**request_kwargs)

    @staticmethod
    def _extract_text_from_gemini_response(response) -> str:
        texts = []
        if getattr(response, "text", None):
            texts.append(str(response.text))

        for part in (getattr(response, "parts", None) or []):
            part_text = getattr(part, "text", None)
            if part_text:
                texts.append(str(part_text))

        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            for part in (getattr(content, "parts", None) or []):
                part_text = getattr(part, "text", None)
                if part_text:
                    texts.append(str(part_text))

        return " ".join(texts).strip()

    @staticmethod
    def _extract_image_from_gemini_response(response):
        from PIL import Image

        for part in (getattr(response, "parts", None) or []):
            try:
                if getattr(part, "inline_data", None) is not None:
                    image = part.as_image()
                    if isinstance(image, Image.Image):
                        image.load()
                        return image
            except Exception:
                continue

        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            for part in (getattr(content, "parts", None) or []):
                try:
                    if getattr(part, "inline_data", None) is not None:
                        image = part.as_image()
                        if isinstance(image, Image.Image):
                            image.load()
                            return image
                except Exception:
                    continue

        return None

    @staticmethod
    def _enhance_image_prompt_with_groq(base_prompt: str) -> str:
        """Use Groq text model to tighten visual prompt; fallback to original on any error."""
        try:
            improve_messages = [
                {
                    "role": "system",
                    "content": (
                        "You optimize image generation prompts. Return ONLY one improved prompt, no explanation. "
                        "Keep it under 350 chars, preserve characters/scenes, include camera/lighting/style clues, and no text in image."
                    )
                },
                {"role": "user", "content": base_prompt}
            ]
            response = text_client.chat.completions.create(
                model=GROQ_TEXT_MODEL_CANDIDATES[0],
                messages=improve_messages,
                temperature=0.2,
                max_tokens=220,
            )
            candidate = response.choices[0].message.content if response and response.choices else ""
            candidate = (candidate or "").strip()
            return candidate[:350] if candidate else base_prompt
        except Exception:
            return base_prompt

    @staticmethod
    def _build_pollinations_url(prompt: str) -> str:
        """Build a free Pollinations text-to-image URL with deterministic seed."""
        cleaned = prompt[:400].strip().rstrip(".!,;:")
        encoded = quote_plus(cleaned)
        seed = random.randint(1, 999999)
        return f"https://image.pollinations.ai/prompt/{encoded}?width=768&height=1024&seed={seed}&nologo=true"

    @staticmethod
    def _build_free_fallback_urls(prompt: str) -> List[str]:
        """Build multiple free fallback URLs to improve reliability when one provider fails."""
        cleaned = prompt[:400].strip().rstrip(".!,;:")
        encoded = quote_plus(cleaned)
        seed = random.randint(1, 999999)
        return [
            f"https://image.pollinations.ai/prompt/{encoded}?width={AIHORDE_IMAGE_WIDTH}&height={AIHORDE_IMAGE_HEIGHT}&seed={seed}&nologo=true&safe=true&model=flux",
            f"https://image.pollinations.ai/prompt/{encoded}?width={AIHORDE_IMAGE_WIDTH}&height={AIHORDE_IMAGE_HEIGHT}&seed={seed}&nologo=true&safe=true&enhance=true",
            f"https://image.pollinations.ai/prompt/{encoded}?width={AIHORDE_IMAGE_WIDTH}&height={AIHORDE_IMAGE_HEIGHT}&seed={seed}&nologo=true&safe=true",
        ]

    @staticmethod
    def _generate_with_aihorde(prompt: str):
        """Generate image through AI Horde async API and return PIL image or None."""
        from PIL import Image
        global AIHORDE_MODEL_FILTER_ENABLED
        global AIHORDE_PROVIDER_ENABLED

        if not AIHORDE_PROVIDER_ENABLED:
            raise RuntimeError("AI Horde provider disabled")

        headers = {
            "apikey": aihorde_api_key,
            "Client-Agent": "PanelCraft:0.1.0:https://github.com/HattoriHanzo16/NaraToon",
            "Content-Type": "application/json",
        }

        base_payload = {
            "prompt": f"{prompt} ###{AIHORDE_NEGATIVE_PROMPT}",
            "nsfw": False,
            "censor_nsfw": True,
            "trusted_workers": False,
            "params": {
                "n": 1,
                "width": AIHORDE_IMAGE_WIDTH,
                "height": AIHORDE_IMAGE_HEIGHT,
                "steps": AIHORDE_STEPS,
                "sampler_name": AIHORDE_SAMPLER_NAME,
                "cfg_scale": AIHORDE_CFG_SCALE,
            },
        }
        if AIHORDE_POST_PROCESSORS:
            base_payload["params"]["post_processing"] = AIHORDE_POST_PROCESSORS

        profiles = [
            {
                "name": "configured",
                "width": AIHORDE_IMAGE_WIDTH,
                "height": AIHORDE_IMAGE_HEIGHT,
                "steps": AIHORDE_STEPS,
                "use_post": bool(AIHORDE_POST_PROCESSORS),
            },
            {
                "name": "safe-fallback",
                "width": 768,
                "height": 1152,
                "steps": min(AIHORDE_STEPS, 24),
                "use_post": False,
            },
            {
                "name": "light-fallback",
                "width": 512,
                "height": 768,
                "steps": min(AIHORDE_STEPS, 20),
                "use_post": False,
            },
        ]

        enqueue = None
        request_payload = None
        last_forbidden = False
        for profile in profiles:
            request_payload = json.loads(json.dumps(base_payload))
            request_payload["params"]["width"] = profile["width"]
            request_payload["params"]["height"] = profile["height"]
            request_payload["params"]["steps"] = profile["steps"]
            if not profile["use_post"]:
                request_payload["params"].pop("post_processing", None)

            selected_models = StoryService._resolve_aihorde_models() if AIHORDE_MODEL_FILTER_ENABLED else []
            if selected_models:
                request_payload["models"] = selected_models

            enqueue = requests.post(
                "https://aihorde.net/api/v2/generate/async",
                headers=headers,
                json=request_payload,
                timeout=30,
            )
            if enqueue.status_code == 403 and selected_models:
                print("WARNING: AI Horde rejected filtered model request (403). Retrying without model filter.")
                AIHORDE_MODEL_FILTER_ENABLED = False
                request_payload.pop("models", None)
                enqueue = requests.post(
                    "https://aihorde.net/api/v2/generate/async",
                    headers=headers,
                    json=request_payload,
                    timeout=30,
                )

            if enqueue.status_code != 403:
                break

            last_forbidden = True
            print(
                f"WARNING: AI Horde rejected profile {profile['name']} ({profile['width']}x{profile['height']}, "
                f"steps={profile['steps']}). Trying lower-cost fallback."
            )

        if enqueue is not None and enqueue.status_code == 403:
            if aihorde_api_key and aihorde_api_key != "0000000000":
                anon_headers = dict(headers)
                anon_headers["apikey"] = "0000000000"
                enqueue = requests.post(
                    "https://aihorde.net/api/v2/generate/async",
                    headers=anon_headers,
                    json=request_payload,
                    timeout=30,
                )
                if enqueue.status_code == 202:
                    headers = anon_headers
                    last_forbidden = False
                else:
                    last_forbidden = enqueue.status_code == 403

        if enqueue is not None and enqueue.status_code == 403 and last_forbidden:
            AIHORDE_PROVIDER_ENABLED = False
            raise RuntimeError("AI Horde rejected all generation profiles with 403. Provider disabled for this process.")

        enqueue.raise_for_status()
        enqueue_data = enqueue.json()
        request_id = enqueue_data.get("id")
        if not request_id:
            raise RuntimeError(f"AI Horde enqueue failed: {enqueue_data}")

        start = time.time()
        while time.time() - start < AIHORDE_TIMEOUT_SECONDS:
            check = requests.get(
                f"https://aihorde.net/api/v2/generate/check/{request_id}",
                headers=headers,
                timeout=20,
            )
            check.raise_for_status()
            check_data = check.json()

            if check_data.get("faulted"):
                raise RuntimeError(f"AI Horde request faulted: {check_data}")

            if check_data.get("done"):
                status = requests.get(
                    f"https://aihorde.net/api/v2/generate/status/{request_id}",
                    headers=headers,
                    timeout=20,
                )
                status.raise_for_status()
                status_data = status.json()
                generations = status_data.get("generations") or []
                if not generations:
                    raise RuntimeError(f"AI Horde done but no generations: {status_data}")

                first_generation = generations[0]
                if StoryService._is_policy_or_nsfw_error(json.dumps(first_generation).lower()):
                    raise RuntimeError(f"AI Horde blocked prompt by policy: {first_generation}")

                image_url = first_generation.get("img")
                if not image_url:
                    raise RuntimeError(f"AI Horde generation missing image URL: {first_generation}")

                image_res = requests.get(image_url, timeout=40)
                image_res.raise_for_status()
                image = Image.open(io.BytesIO(image_res.content))
                image.load()
                return image

            time.sleep(AIHORDE_POLL_SECONDS)

        raise TimeoutError(f"AI Horde timed out after {AIHORDE_TIMEOUT_SECONDS}s")

    @staticmethod
    def _resolve_aihorde_models() -> List[str]:
        """Resolve model list against AI Horde catalog; use explicit env models first, then preferences."""
        configured = AIHORDE_MODELS if AIHORDE_MODELS else AIHORDE_MODEL_PREFERENCES
        if not configured:
            return []

        try:
            catalog_res = requests.get("https://aihorde.net/api/v2/status/models", timeout=20)
            catalog_res.raise_for_status()
            catalog = catalog_res.json() or []

            image_catalog = [item for item in catalog if str(item.get("type", "")).lower() == "image"]
            available = {
                str(item.get("name", "")).strip().lower(): item
                for item in image_catalog
                if str(item.get("name", "")).strip()
            }

            blocked_keywords = (
                "nsfw",
                "hentai",
                "porn",
                "nude",
                "erotic",
                "fetish",
                "sexy",
                "waifu",
                "anything",
            )

            selected_entries = []
            for preferred in configured:
                key = preferred.strip().lower()
                entry = available.get(key)
                if not entry:
                    continue
                candidate_name = str(entry.get("name", "")).strip().lower()
                if any(blocked in candidate_name for blocked in blocked_keywords):
                    continue
                selected_entries.append(entry)

            selected = [
                str(entry.get("name", "")).strip()
                for entry in sorted(selected_entries, key=StoryService._score_aihorde_model, reverse=True)
                if str(entry.get("name", "")).strip()
            ]

            if selected:
                final_models = selected[:4]
                print(f"DEBUG: AI Horde selected models: {final_models}")
                return final_models

            safe_quality_keywords = (
                "dreamshaper",
                "juggernaut",
                "albedo",
                "realvis",
                "sdxl",
                "stable diffusion xl",
                "deliberate",
            )
            fallback_selected = []
            for entry in image_catalog:
                name = str(entry.get("name", "")).strip()
                if not name:
                    continue
                lower_name = name.lower()
                if any(blocked in lower_name for blocked in blocked_keywords):
                    continue
                if any(keyword in lower_name for keyword in safe_quality_keywords):
                    fallback_selected.append(entry)

            if fallback_selected:
                ranked = sorted(fallback_selected, key=StoryService._score_aihorde_model, reverse=True)
                final_models = [
                    str(entry.get("name", "")).strip()
                    for entry in ranked
                    if str(entry.get("name", "")).strip()
                ][:4]
                print(f"WARNING: Configured models unavailable. Falling back to safe quality models: {final_models}")
                return final_models

            print("WARNING: No safe quality AI Horde models found in catalog. Using unrestricted worker pool.")
            return []
        except Exception as e:
            print(f"WARNING: Failed to fetch AI Horde model catalog: {e}. Using configured models as-is.")
            return AIHORDE_MODELS

    @staticmethod
    def _score_aihorde_model(entry: Dict[str, Any]) -> float:
        """Score models by quality/reliability signals from AI Horde status API."""
        performance = float(entry.get("performance") or 0.0)
        workers = float(entry.get("count") or 0.0)
        queued = float(entry.get("queued") or 0.0)
        eta = float(entry.get("eta") or 0.0)
        return (performance / 100000.0) + (workers * 2.0) - (queued / 10000000.0) - (eta * 0.2)
    
    @staticmethod
    def save_generated_image(image, filename: str = None) -> str:
        """Persist a PIL image locally and return the served URL."""
        try:
            from PIL import Image

            if not isinstance(image, Image.Image):
                raise TypeError("Expected PIL.Image from provider output")

            image = StoryService._postprocess_generated_image(image)

            final_name = filename or f"{uuid.uuid4()}.png"
            filepath = IMAGES_DIR / final_name
            image.save(filepath, format="PNG")
            return f"{BASE_IMAGE_URL}{final_name}"
        except Exception as e:
            print(f"Error saving generated image: {str(e)}")
            return BASE_IMAGE_URL + "placeholder-download-error.png"

    @staticmethod
    def _postprocess_generated_image(image):
        """Normalize dimensions and sharpen output for more consistent quality."""
        from PIL import Image, ImageEnhance, ImageFilter

        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        elif image.mode == "RGBA":
            image = image.convert("RGB")

        image = StoryService._fit_image_to_target(image, TARGET_IMAGE_WIDTH, TARGET_IMAGE_HEIGHT)

        # Light-touch enhancement keeps style while improving panel readability.
        image = image.filter(ImageFilter.UnsharpMask(radius=1.4, percent=125, threshold=2))
        image = ImageEnhance.Contrast(image).enhance(1.06)
        image = ImageEnhance.Sharpness(image).enhance(1.08)
        return image

    @staticmethod
    def _fit_image_to_target(image, target_width: int, target_height: int):
        """Upscale/crop to a stable 3:4 panel size for frontend consistency."""
        from PIL import Image

        if target_width <= 0 or target_height <= 0:
            return image

        src_w, src_h = image.size
        if src_w <= 0 or src_h <= 0:
            return image

        scale = max(target_width / src_w, target_height / src_h)
        resized_w = max(1, int(round(src_w * scale)))
        resized_h = max(1, int(round(src_h * scale)))

        if resized_w != src_w or resized_h != src_h:
            image = image.resize((resized_w, resized_h), Image.Resampling.LANCZOS)

        left = max(0, (resized_w - target_width) // 2)
        top = max(0, (resized_h - target_height) // 2)
        right = left + target_width
        bottom = top + target_height
        return image.crop((left, top, right, bottom))

    @staticmethod
    def _prompt_cache_filename(prompt: str) -> str:
        """Deterministic cache filename from prompt text."""
        digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:20]
        return f"cache-{digest}.png"

    @staticmethod
    def process_story(story_text: str, genre: str, mood: str, style: str, memory_state: str = None) -> Dict:
        """Process the entire story and generate comic panels with text and images."""
        # Create placeholder images if they don't exist
        StoryService.ensure_placeholder_images_exist()
        
        analysis_result = StoryService.analyze_story(story_text, genre, mood, style, memory_state) 
        panels_data = analysis_result.get("panels", [])
        comic_panels_output = []
        
        for i, panel_info in enumerate(panels_data):
            try:
                visual_desc = panel_info.get("scene_description", "Default scene") 
                image_prompt = panel_info.get("image_prompt", visual_desc)
                
                # Combine dialogue and caption for the frontend panel_text
                dialogue = panel_info.get("dialogue", "")
                caption = panel_info.get("caption", "")
                panel_text_content = ""
                if caption:
                    panel_text_content += f"[{caption}] "
                if dialogue:
                    panel_text_content += f'"{dialogue}"'
                
                panel_text_content = panel_text_content.strip()

                # --- Check for empty text --- 
                if not panel_text_content:
                    print(f"WARNING: Panel {i+1} has empty panel_text_content. Panel Info: {panel_info}")
                # --- End Check ---

                if not image_prompt:
                    print(f"WARNING: Missing image prompt for panel {i+1}. Using fallback. Panel Info: {panel_info}")
                    image_prompt = "Abstract comic panel"

                image_url = StoryService.generate_panel(image_prompt) 

                comic_panels_output.append({
                    "panel_number": i + 1,
                    "scene_description": visual_desc, 
                    "panel_text": panel_text_content, 
                    "image_prompt": image_prompt,
                    "image_url": image_url
                })
            except Exception as e:
                print(f"ERROR: Failed to process panel {i+1}: {str(e)}")
                # Add a fallback panel instead of failing the whole process
                comic_panels_output.append({
                    "panel_number": i + 1,
                    "scene_description": "Error generating panel",
                    "panel_text": panel_text_content or "Error occurred", 
                    "image_prompt": "Error",
                    "image_url": BASE_IMAGE_URL + "placeholder-panel-error.png"
                })
        
        analysis_result["panels"] = comic_panels_output
        return analysis_result

    @staticmethod
    def _parse_json_safely(raw_text: str) -> Dict:
        """Extract and parse the first JSON object found in a raw model response."""
        # Sometimes models wrap JSON in markdown blocks
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0]
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0]

        first_brace = raw_text.find('{')
        last_brace = raw_text.rfind('}')

        if first_brace == -1 or last_brace == -1 or last_brace <= first_brace:
            raise json.JSONDecodeError("No JSON object detected", raw_text, 0)

        try:
            return json.loads(raw_text[first_brace:last_brace + 1])
        except json.JSONDecodeError as err:
            print(f"DEBUG: Failed to parse JSON, raw text: {raw_text}")
            raise err

    @staticmethod
    def ensure_placeholder_images_exist():
        """Create placeholder images if they don't exist."""
        placeholders = {
            "placeholder-rate-limit.png": "Rate Limit Exceeded",
            "placeholder-error.png": "Image Generation Failed",
            "placeholder-unexpected.png": "Unexpected Error",
            "placeholder-download-error.png": "Image Download Failed",
            "placeholder-panel-error.png": "Panel Generation Failed"
        }
        
        for filename, text in placeholders.items():
            filepath = IMAGES_DIR / filename
            if not filepath.exists():
                StoryService.create_placeholder_image(filepath, text)
    
    @staticmethod
    def create_placeholder_image(filepath, text):
        """Create a simple placeholder image with text."""
        try:
            # Use PIL to create a simple placeholder image
            from PIL import Image, ImageDraw, ImageFont
            
            # Create a gray image
            img = Image.new('RGB', (512, 512), color=(200, 200, 200))
            d = ImageDraw.Draw(img)
            
            # Try to use a default font
            try:
                font = ImageFont.truetype("Arial", 24)
            except:
                font = ImageFont.load_default()
            
            # Draw the text
            d.text((256, 256), text, fill=(50, 50, 50), font=font, anchor="mm")
            
            # Save the image
            img.save(filepath)
        except Exception as e:
            print(f"Failed to create placeholder image: {str(e)}")
            # Create a minimal placeholder if PIL fails
            with open(filepath, 'w') as f:
                f.write("Placeholder Image") 