from fastapi import APIRouter, Header, HTTPException, Body
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import logging
import json

from core.database import fetch, execute, fetchval, fetchrow
from core.config import get_settings

# Import service with error handling to prevent app crash on startup if missing
try:
    from services.recommend_flow import generate_text_gemini
except ImportError:
    logging.error("Could not import generate_text_gemini from services.recommend_flow. Using mock.")
    async def generate_text_gemini(prompt: str) -> str:
        return "AI Summary unavailable (Import Error)."

router = APIRouter(prefix="/daily-digest", tags=["daily-digest"])
logger = logging.getLogger("uvicorn")

# --- Models ---
from pydantic import BaseModel

class PostCreate(BaseModel):
    content: str

class CommentCreate(BaseModel):
    post_id: int
    content: str

# --- Helper to calculate metrics ---
async def get_quotation_metrics():
    # Fetch all quotations
    try:
        rows = await fetch("SELECT total_price, status, created_at FROM quotations")
    except Exception as e:
        logger.error(f"Database error fetching quotations: {e}")
        return {
            "current_year": {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "total": 0, "won": 0, "lost": 0, "conv_rate": 0},
            "last_year": {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "total": 0, "won": 0, "lost": 0, "conv_rate": 0},
        }
    
    now = datetime.now()
    current_year = now.year
    last_year = current_year - 1
    
    # Initialize structure
    data = {
        "current_year": {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "total": 0, "won": 0, "lost": 0},
        "last_year": {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "total": 0, "won": 0, "lost": 0},
    }
    
    for row in rows:
        dt = row['created_at']
        if not dt: continue
        
        year = dt.year
        quarter = (dt.month - 1) // 3 + 1
        q_key = f"q{quarter}"
        
        target = None
        if year == current_year: target = data["current_year"]
        elif year == last_year: target = data["last_year"]
        
        if target:
            val = float(row['total_price'] or 0)
            target[q_key] += val
            target['total'] += val
            
            status = (row['status'] or '').lower()
            if status in ['finalized', 'sent', 'won']: 
                target['won'] += 1
            elif status in ['lost', 'rejected']:
                target['lost'] += 1

    # Calculate conversion rates
    for year_key in ["current_year", "last_year"]:
        d = data[year_key]
        total_deals = d['won'] + d['lost']
        d['conv_rate'] = (d['won'] / total_deals * 100) if total_deals > 0 else 0
        
    return data

# --- Endpoints ---

@router.get("/summary")
async def get_daily_summary():
    metrics = await get_quotation_metrics()
    
    # Generate AI Insight
    prompt = f"""
    Analyze the following sales quotation data and provide a concise, professional executive summary for a manager.
    
    Current Year ({datetime.now().year}):
    - Q1: ${metrics['current_year']['q1']:,.2f}
    - Q2: ${metrics['current_year']['q2']:,.2f}
    - Q3: ${metrics['current_year']['q3']:,.2f}
    - Q4: ${metrics['current_year']['q4']:,.2f}
    - Total: ${metrics['current_year']['total']:,.2f}
    - Conversion Rate: {metrics['current_year']['conv_rate']:.1f}%
    
    Last Year ({datetime.now().year - 1}):
    - Total: ${metrics['last_year']['total']:,.2f}
    - Conversion Rate: {metrics['last_year']['conv_rate']:.1f}%
    
    Highlight key trends, compare with last year, and suggest 1 strategic action.
    """
    
    try:
        ai_summary = await generate_text_gemini(prompt)
    except Exception as e:
        logger.error(f"AI generation failed: {e}")
        ai_summary = "AI summary currently unavailable."

    return {
        "metrics": metrics,
        "ai_summary": ai_summary,
        "date": datetime.now().isoformat()
    }

@router.get("/posts")
async def get_posts():
    try:
        posts = await fetch("""
            SELECT p.id, p.user_name, p.content, p.created_at, p.likes,
                   (SELECT COUNT(*) FROM daily_comments c WHERE c.post_id = p.id) as comment_count
            FROM daily_posts p
            ORDER BY p.created_at DESC
            LIMIT 50
        """)
        
        results = []
        for p in posts:
            post_data = dict(p)
            comments = await fetch("SELECT id, user_name, content, created_at FROM daily_comments WHERE post_id = $1 ORDER BY created_at ASC", p['id'])
            post_data['comments'] = [dict(c) for c in comments]
            results.append(post_data)
            
        return results
    except Exception as e:
        logger.error(f"Error fetching posts: {e}")
        return []

@router.post("/posts")
async def create_post(payload: PostCreate, x_user_id: Optional[int] = Header(None), x_user_email: Optional[str] = Header(None)):
    user_name = "Guest"
    if x_user_id:
        row = await fetchrow("SELECT name FROM users WHERE id = $1", x_user_id)
        if row: user_name = row['name']
    elif x_user_email:
        user_name = x_user_email.split('@')[0]
        
    await execute(
        "INSERT INTO daily_posts (user_id, user_name, content) VALUES ($1, $2, $3)",
        x_user_id, user_name, payload.content
    )
    return {"status": "success"}

@router.post("/comments")
async def create_comment(payload: CommentCreate, x_user_id: Optional[int] = Header(None), x_user_email: Optional[str] = Header(None)):
    user_name = "Guest"
    if x_user_id:
        row = await fetchrow("SELECT name FROM users WHERE id = $1", x_user_id)
        if row: user_name = row['name']
    elif x_user_email:
        user_name = x_user_email.split('@')[0]
        
    await execute(
        "INSERT INTO daily_comments (post_id, user_id, user_name, content) VALUES ($1, $2, $3, $4)",
        payload.post_id, x_user_id, user_name, payload.content
    )
    return {"status": "success"}