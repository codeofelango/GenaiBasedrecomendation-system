from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Header, BackgroundTasks, Response
from typing import List, Any, Dict, Optional
import logging
import json
import base64
import shutil
import os
import uuid
from decimal import Decimal
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from fpdf import FPDF

from services.pdf_processor import extract_text_from_pdf
from agents.rfp_agent import run_quotation_flow
from models.quotation_db import QuotationDB, QuotationUpdate, AuditLogEntry, CommentDB, CommentCreate
from core.database import fetchval, fetch, execute, fetchrow
from services.vector_search import search_similar_products
from services.embeddings import embed_text
from core.activity_logger import log_user_activity
from core.config import get_settings

router = APIRouter(prefix="/quotation", tags=["quotation"])
logger = logging.getLogger("uvicorn")
settings = get_settings()

mail_config = ConnectionConfig(
    MAIL_USERNAME=settings.mail_username,
    MAIL_PASSWORD=settings.mail_password,
    MAIL_FROM=settings.mail_from,
    MAIL_PORT=settings.mail_port,
    MAIL_SERVER=settings.mail_server,
    MAIL_STARTTLS=settings.mail_starttls,
    MAIL_SSL_TLS=settings.mail_ssl_tls,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal): return float(obj)
        return super(DecimalEncoder, self).default(obj)

class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'Project Phoenix - Quotation', 0, 1, 'C')
        self.ln(10)
    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

def generate_quotation_pdf(data: Dict[str, Any], quote_id: int) -> bytes:
    pdf = PDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(0, 10, f"Quotation #: {quote_id}", ln=True)
    pdf.cell(0, 10, f"Client: {data.get('client_name', 'N/A')}", ln=True)
    pdf.cell(0, 10, f"Date: {data.get('generated_at', 'N/A')}", ln=True)
    pdf.ln(10)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(80, 10, "Product", 1)
    pdf.cell(60, 10, "Description", 1)
    pdf.cell(20, 10, "Qty", 1)
    pdf.cell(30, 10, "Price", 1)
    pdf.ln()
    pdf.set_font("Arial", size=10)
    content = data.get("content", {})
    matches = content.get("matches", [])
    total = content.get("total_price", 0)
    for m in matches:
        title = m.get('product_title', 'Item')[:30]
        desc = (m.get('product_description') or '')[:25]
        pdf.cell(80, 10, title, 1)
        pdf.cell(60, 10, desc, 1)
        pdf.cell(20, 10, str(m.get('quantity', 1)), 1)
        pdf.cell(30, 10, f"${float(m.get('price', 0)):.2f}", 1)
        pdf.ln()
    pdf.ln(5)
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(0, 10, f"Total Amount: ${float(total):,.2f}", ln=True, align='R')
    return bytes(pdf.output())

@router.post("/upload", response_model=QuotationDB)
async def upload_and_process_rfp(file: UploadFile = File(...), x_user_id: Optional[int] = Header(None), x_user_email: Optional[str] = Header(None)) -> Any:
    logger.info(f"Processing RFP: {file.filename}")
    if not file.filename.lower().endswith('.pdf'): raise HTTPException(status_code=400, detail="Only PDF files are supported")
    try:
        content = await file.read()
        text = extract_text_from_pdf(content)
        if not text or len(text) < 10: raise HTTPException(status_code=400, detail="Could not extract text")
        ai_quotation = await run_quotation_flow(text)
        content_json = ai_quotation.model_dump(mode='json')
        content_str = json.dumps(content_json, cls=DecimalEncoder)
        q_id = await fetchval("""INSERT INTO quotations (rfp_title, client_name, status, total_price, content) VALUES ($1, $2, 'draft', $3, $4) RETURNING id""", ai_quotation.rfp_title, ai_quotation.client_name or "New Client", ai_quotation.total_price, content_str)
        await log_user_activity(user_id=x_user_id, user_email=x_user_email, action="Created Quotation", entity_type="Quotation", entity_id=q_id, details={"filename": file.filename, "value": ai_quotation.total_price})
        row = await fetchrow("SELECT * FROM quotations WHERE id = $1", q_id)
        return _map_row_to_model(row)
    except Exception as e:
        logger.error(f"Error processing upload: {e}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

@router.get("/list", response_model=List[QuotationDB])
async def list_quotations():
    rows = await fetch("SELECT * FROM quotations ORDER BY updated_at DESC")
    return [_map_row_to_model(row) for row in rows]

@router.get("/{id}", response_model=QuotationDB)
async def get_quotation(id: int):
    row = await fetchrow("SELECT * FROM quotations WHERE id = $1", id)
    if not row: raise HTTPException(status_code=404, detail="Not found")
    return _map_row_to_model(row)

@router.post("/{id}/update")
async def update_quotation(id: int, payload: QuotationUpdate, x_user_id: Optional[int] = Header(None), x_user_email: Optional[str] = Header(None)):
    try:
        current_row = await fetchrow("SELECT content FROM quotations WHERE id = $1", id)
        if not current_row: raise HTTPException(status_code=404, detail="Not found")
        content_val = current_row['content']
        content = json.loads(content_val) if isinstance(content_val, str) else content_val
        if payload.client_name: await execute("UPDATE quotations SET client_name = $1 WHERE id = $2", payload.client_name, id)
        if payload.items:
            new_total = 0.0
            matches = content.get("matches", [])
            for update_item in payload.items:
                for match in matches:
                    if match.get("product_id") == update_item.product_id:
                        match["quantity"] = update_item.quantity
                        match["unit_price"] = update_item.unit_price
                        match["price"] = update_item.unit_price * update_item.quantity
            new_total = sum(m.get("price", 0) for m in matches)
            content["total_price"] = new_total
            await execute("UPDATE quotations SET total_price = $1 WHERE id = $2", new_total, id)
            await log_user_activity(user_id=x_user_id, user_email=x_user_email, action="Updated Pricing", entity_type="Quotation", entity_id=id, details={"new_total": new_total})
        await execute("UPDATE quotations SET content = $1, updated_at = NOW() WHERE id = $2", json.dumps(content, cls=DecimalEncoder), id)
        return {"status": "success", "total_price": content.get("total_price", 0)}
    except Exception as e:
        logger.error(f"Error updating: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{id}/rematch")
async def rematch_quotation(id: int, requirements: List[Dict[str, Any]] = Body(...), x_user_id: Optional[int] = Header(None), x_user_email: Optional[str] = Header(None)):
    try:
        current_row = await fetchrow("SELECT content FROM quotations WHERE id = $1", id)
        if not current_row: raise HTTPException(status_code=404, detail="Not found")
        content_val = current_row['content']
        content = json.loads(content_val) if isinstance(content_val, str) else content_val
        new_matches = []
        for req in requirements:
            search_text = (f"{req.get('Fixture_Type', '')} {req.get('Wattage', '')} {req.get('CCT', req.get('Color_Temperature', ''))} {req.get('IP', req.get('IP_Rating', ''))} {req.get('Beam_Angle', '')} {req.get('Lumen_Output', '')} {req.get('Description', req.get('description', ''))}").strip()
            if not search_text: continue
            embedding = await embed_text(search_text)
            candidates = await search_similar_products(embedding, top_k=5)
            if candidates:
                best = candidates[0]
                alts = candidates[1:3]
                score = best.get("score", 0.0)
                try: qty_val = float(req.get("Qty", 1))
                except: qty_val = 1.0
                new_matches.append({
                    "requirement_id": req.get("type_id", req.get("id", "N/A")),
                    "product_id": best.get("id"),
                    "product_title": best.get("title"),
                    "product_description": best.get("description"),
                    "match_score": score,
                    "reasoning": f"Best Match: {best.get('title')} ({score:.2f})",
                    "quantity": qty_val,
                    "unit_price": float(best.get("price", 100.0)),
                    "price": float(best.get("price", 100.0)) * qty_val,
                    "image_url": best.get("image_url") or "",
                    "alternatives": candidates
                })
        content["requirements"] = requirements
        content["matches"] = new_matches
        content["total_price"] = sum(m["price"] for m in new_matches)
        await execute("UPDATE quotations SET content = $1, total_price = $2, updated_at = NOW() WHERE id = $3", json.dumps(content, cls=DecimalEncoder), content["total_price"], id)
        await log_user_activity(user_id=x_user_id, user_email=x_user_email, action="Regenerated Matches", entity_type="Quotation", entity_id=id, details={"match_count": len(new_matches)})
        return {"status": "success", "matches": new_matches, "total_price": content["total_price"]}
    except Exception as e:
        logger.error(f"Rematch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{id}/status")
async def set_status(id: int, status: str = Body(..., embed=True), x_user_id: Optional[int] = Header(None), x_user_email: Optional[str] = Header(None)):
    allowed = ["draft", "saved", "created", "printed", "sent", "re_changes", "finalized"]
    if status not in allowed: raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {allowed}")
    await execute("UPDATE quotations SET status = $1, updated_at = NOW() WHERE id = $2", status, id)
    await log_user_activity(user_id=x_user_id, user_email=x_user_email, action="Updated Status", entity_type="Quotation", entity_id=id, details={"new_status": status})
    return {"status": "success"}

@router.get("/{id}/audit", response_model=List[AuditLogEntry])
async def get_audit_log(id: int):
    rows = await fetch("SELECT * FROM quotation_audit_log WHERE quotation_id = $1 ORDER BY timestamp DESC", id)
    return [dict(row) for row in rows]

# --- Discussion Endpoints ---

@router.get("/{id}/comments", response_model=List[CommentDB])
async def get_comments(id: int):
    # Using explicit columns to prevent Asyncpg InvalidCachedStatementError due to schema change
    rows = await fetch(
        """
        SELECT id, quotation_id, user_id, user_name, user_email, message, is_internal, attachments, created_at
        FROM quotation_comments 
        WHERE quotation_id = $1 
        ORDER BY created_at ASC
        """, 
        id
    )
    # Ensure attachments is parsed if string
    results = []
    for row in rows:
        d = dict(row)
        if 'attachments' in d:
            if isinstance(d.get('attachments'), str):
                try: d['attachments'] = json.loads(d['attachments'])
                except: d['attachments'] = []
            elif d.get('attachments') is None:
                d['attachments'] = []
        else:
            d['attachments'] = []
        results.append(d)
    return results

@router.post("/{id}/comments/upload")
async def upload_comment_attachment(id: int, file: UploadFile = File(...)):
    try:
        # Create unique filename
        file_ext = file.filename.split('.')[-1]
        unique_name = f"{id}_{uuid.uuid4()}.{file_ext}"
        file_path = f"uploads/{unique_name}"
        
        # Save locally
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Return the public URL
        # In production, this would be a full domain URL or S3 link
        url = f"http://localhost:8000/uploads/{unique_name}"
        
        return {
            "name": file.filename,
            "url": url,
            "type": file.content_type or "application/octet-stream"
        }
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail="File upload failed")

@router.post("/{id}/comments")
async def add_comment(
    id: int, 
    payload: CommentCreate, 
    x_user_id: Optional[int] = Header(None),
    x_user_email: Optional[str] = Header(None)
):
    user_name = "Guest"
    if x_user_id:
        u_row = await fetchrow("SELECT name FROM users WHERE id = $1", x_user_id)
        if u_row:
            user_name = u_row['name']
    elif x_user_email:
        user_name = x_user_email.split('@')[0]

    # Convert attachments list to JSON string for storage
    attachments_json = json.dumps([a.model_dump() for a in payload.attachments])

    await execute(
        """
        INSERT INTO quotation_comments (quotation_id, user_id, user_name, user_email, message, is_internal, attachments)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        """,
        id, x_user_id, user_name, x_user_email, payload.message, payload.is_internal, attachments_json
    )
    
    await log_user_activity(x_user_id, x_user_email, "Posted Comment", "Quotation", id, details={"has_attachments": len(payload.attachments) > 0})
    
    return {"status": "success"}

@router.get("/{id}/download")
async def download_quotation(id: int, x_user_id: Optional[int] = Header(None), x_user_email: Optional[str] = Header(None)):
    row = await fetchrow("SELECT * FROM quotations WHERE id = $1", id)
    if not row: raise HTTPException(status_code=404, detail="Not found")
    q = _map_row_to_model(row)
    
    pdf_bytes = generate_quotation_pdf(q, id)
    
    await log_user_activity(user_id=x_user_id, user_email=x_user_email, action="Downloaded PDF", entity_type="Quotation", entity_id=id)
    
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=Quotation_{id}.pdf"})

@router.post("/{id}/send")
async def send_quotation_email(
    id: int, 
    email: str = Body(..., embed=True),
    x_user_id: Optional[int] = Header(None),
    x_user_email: Optional[str] = Header(None)
):
    row = await fetchrow("SELECT * FROM quotations WHERE id = $1", id)
    if not row: raise HTTPException(status_code=404, detail="Quotation not found")
    q = _map_row_to_model(row)
    
    pdf_bytes = generate_quotation_pdf(q, id)
    link = f"http://localhost:3000/quotation/{id}"
    
    attachment = {
        "file": f"Quotation_{id}.pdf",
        "headers": {"Content-Type": "application/pdf"},
        "mime_type": "application/pdf",
        "base64": base64.b64encode(pdf_bytes).decode('utf-8')
    }
    
    message = MessageSchema(
        subject=f"Quotation #{id} - {q.get('client_name')}",
        recipients=[email],
        body=f"<h2>Quotation #{id}</h2><p>Please find attached.</p><p><a href='{link}'>View Online</a></p>",
        subtype=MessageType.html,
        attachments=[attachment]
    )
    
    fm = FastMail(mail_config)
    try: await fm.send_message(message)
    except Exception as e:
        print(f"❌ Email failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")

    await execute("UPDATE quotations SET status = 'sent', updated_at = NOW() WHERE id = $1", id)
    await log_user_activity(user_id=x_user_id, user_email=x_user_email, action="Sent Quotation Email", entity_type="Quotation", entity_id=id, details={"recipient": email})
    return {"status": "success", "message": f"Email sent to {email}"}

def _map_row_to_model(row: Any) -> Dict[str, Any]:
    d = dict(row)
    if "content" in d and isinstance(d["content"], str):
        try: d["content"] = json.loads(d["content"])
        except: d["content"] = {}
    return d