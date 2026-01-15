import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from fastapi.staticfiles import StaticFiles # Import this
import os
# Absolute imports
from core.config import get_settings
from core.database import init_pool, close_pool, fetchval
from api.recommend import router as recommend_router
from api.items import router as items_router
from api.users import router as users_router
from api.interactions import router as interactions_router
from api.abtest import router as abtest_router
from api.quotation import router as quotation_router
from api.auth import router as auth_router
from api.opportunities import router as opportunities_router
from api.activity import router as activity_router
from api.email_bot import router as email_bot_router
import api.visual_search as visual_search   # Visual Search Module
import api.external_search as external_search   # External Search Module
from api.db_chat import router as db_chat_router  # <--- Add this

# Ensure uploads directory exists
os.makedirs("uploads", exist_ok=True)

# Mount the uploads directory to be accessible via /uploads

# New Import
from api.rag import router as rag_router 
from services.embeddings import embed_all_items_missing, embed_all_products_missing

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    async def check_embeddings():
        try:
            missing_items = await fetchval("SELECT COUNT(*) FROM items WHERE embedding IS NULL")
            if missing_items and missing_items > 0:
                print(f"🔄 Found {missing_items} items missing embeddings...")
                await embed_all_items_missing(limit=100)

            has_products = await fetchval("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'products')")
            if has_products:
                missing_prods = await fetchval("SELECT COUNT(*) FROM products WHERE embedding IS NULL")
                if missing_prods and missing_prods > 0:
                     print(f"🔄 Found {missing_prods} products missing embeddings...")
                     await embed_all_products_missing(limit=500)
        except Exception as e:
            print(f"⚠️ Startup check warning: {e}")
    asyncio.create_task(check_embeddings())
    yield
    await close_pool()

def create_app() -> FastAPI:
    app = FastAPI(title="Project Phoenix Backend", version="2.0", lifespan=lifespan)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

    
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
    )

    app.include_router(recommend_router)
    app.include_router(items_router)
    app.include_router(users_router)
    app.include_router(interactions_router)
    app.include_router(abtest_router)
    app.include_router(quotation_router)
    app.include_router(auth_router)
    app.include_router(opportunities_router)
    app.include_router(activity_router)
    app.include_router(email_bot_router)
    app.include_router(visual_search.router, prefix="/visual-search", tags=["Visual Search"])
    app.include_router(external_search.router, prefix="/external", tags=["External Search"])
    app.include_router(db_chat_router)  # <--- Register DB Chat
    # Register RAG
    app.include_router(rag_router)

    @app.get("/")
    async def root(): return {"status": "ok", "system": "Project Phoenix"}

    return app

app = create_app()

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run("main:app", host=settings.backend_host, port=settings.backend_port, reload=True)