from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class QuotationItemUpdate(BaseModel):
    product_id: int
    quantity: int
    unit_price: float

class QuotationUpdate(BaseModel):
    client_name: Optional[str] = None
    items: Optional[List[QuotationItemUpdate]] = None
    summary: Optional[str] = None
    status: Optional[str] = None

class QuotationDB(BaseModel):
    id: int
    rfp_title: str
    client_name: str
    status: str
    total_price: float
    content: Dict[str, Any]
    version: int = 1  # Added version field
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class QuotationVersionDB(BaseModel):
    id: int
    quotation_id: int
    version: int
    total_price: float
    created_at: datetime
    change_reason: Optional[str] = None
    # We might not send full 'content' in a list view to save bandwidth
    
class AuditLogEntry(BaseModel):
    id: int
    action: str
    changed_by: str
    timestamp: datetime
    change_details: Optional[str]

class Attachment(BaseModel):
    name: str
    url: str
    type: str

class CommentCreate(BaseModel):
    message: str
    is_internal: bool = False
    attachments: List[Attachment] = []
    # New fields for guest/public comments
    author_name: Optional[str] = None
    author_email: Optional[str] = None

class CommentDB(BaseModel):
    id: int
    quotation_id: int
    user_id: Optional[int]
    user_name: Optional[str]
    user_email: Optional[str]
    message: str
    is_internal: bool
    attachments: Optional[List[Dict[str, Any]]] = [] # Added attachments
    created_at: datetime