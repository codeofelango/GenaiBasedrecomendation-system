from typing import Any, Dict, List
import os
import logging
import google.generativeai as genai

# Absolute imports
from core.database import fetchrow
from services.embeddings import embed_and_store_user, get_cached_user_embedding
from services.vector_search import search_similar_items
from services.ranking import rerank
from services.ml_client import chat_reasoning
from agents.graph import run_recommendation_graph

logger = logging.getLogger(__name__)

# Configure Gemini (Local to this service wrapper)
api_key = os.getenv("GOOGLE_API_KEY")
if api_key:
    try:
        genai.configure(api_key=api_key)
    except Exception as e:
        logger.error(f"Failed to configure Gemini in recommend_flow: {e}")

model = None
try:
    model = genai.GenerativeModel('gemini-pro')
except Exception as e:
    logger.warning(f"Failed to initialize Gemini model: {e}")

async def generate_text_gemini(prompt: str) -> str:
    """
    Generates text using Google Gemini model.
    """
    global model
    if not api_key:
        logger.warning("GOOGLE_API_KEY not found. Returning mock response.")
        return "AI Summary unavailable (Missing API Key)."
        
    try:
        if not model:
             model = genai.GenerativeModel('gemini-pro')

        response = model.generate_content(prompt)
        if response and response.text:
            return response.text
        return "No response generated."
    except Exception as e:
        logger.error(f"Gemini generation error: {e}")
        return f"Error generating summary: {str(e)}"

async def _load_user_profile(user_id: int) -> Dict[str, Any]:
    row = await fetchrow(
        """
        SELECT id, name, email, interests
        FROM users
        WHERE id = $1
        """,
        int(user_id),
    )
    if not row:
        return {}
    return {"id": row["id"], "name": row["name"], "email": row["email"], "interests": row["interests"]}

async def _summarize_user(user: Dict[str, Any]) -> str:
    interests = ", ".join(user.get("interests", []) or [])
    prompt = f"Summarize this user for course recommendations. Name: {user.get('name')}. Interests: {interests}."
    summary = await chat_reasoning(prompt, system_prompt="You are a recommender system assistant.", max_tokens=200)
    return summary.strip()

async def generate_recommendations(user_id: int, top_k: int = 20) -> Dict[str, Any]:
    # 1) Load user profile
    user = await _load_user_profile(user_id)
    if not user:
        return {"recommendations": [], "current_courses": []}

    # 2) Summarize user
    summary = await _summarize_user(user)

    # 3) Embed summary (cache and reuse)
    user_vector = await get_cached_user_embedding(user_id)
    if not user_vector:
        user_vector = await embed_and_store_user(user_id, summary or "General learner profile")

    # 4) Vector search
    candidates = await search_similar_items(user_vector, top_k=top_k)

    # 5) LLM rerank
    reranked = await rerank(query=summary, candidates=candidates)

    # 6) LangGraph multi-agent flow
    state = {"user": user, "summary": summary, "candidates": reranked}
    final_state = await run_recommendation_graph(state)

    # 7) Final recommendations
    final_recs = final_state.get("recommendations", reranked)
    explanations = final_state.get("explanations", {})

    # Attach explanations
    for r in final_recs:
        item_id = int(r.get("id", 0))
        if item_id in explanations:
            r["explanation"] = explanations[item_id]
            
    # 8) Derive current courses from interactions (Mock for now or fetch real)
    current_courses = []
    
    return {"recommendations": final_recs, "current_courses": current_courses}