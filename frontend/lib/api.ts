const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Helper function to get headers with auth token
function getAuthHeaders(options: RequestInit = {}): HeadersInit {
    const headers: any = { ...options.headers };
    if (typeof window !== "undefined") {
        const userStr = localStorage.getItem("user");
        const token = localStorage.getItem("token");
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                headers["x-user-id"] = user.id.toString();
                headers["x-user-email"] = user.email;
            } catch (e) {}
        }
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

async function getJSON(path: string, options: RequestInit = {}) {
    const headers = getAuthHeaders(options);
	const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store", ...options, headers });
	if (!res.ok) {
        let errorMsg = `Request failed: ${res.status}`;
        try {
            const data = await res.json();
            if (data.detail) errorMsg = data.detail;
        } catch (e) {}
        throw new Error(errorMsg);
    }
	return res.json();
}

export async function getUsers() { return getJSON("/users"); }
export async function getUser(id: number) { const users = await getUsers(); return users.find((u: any) => u.id === id); }
export async function getProducts() { return getJSON("/items"); }
export async function addProduct(payload: any) { return getJSON("/items/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }

export async function updateProduct(id: number, payload: any) { 
    return getJSON(`/items/${id}`, { 
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(payload) 
    }); 
}

export async function embedAllProducts() { return getJSON("/items/embed_all", { method: "POST" }); }
export async function searchProducts(query: string) { return getJSON(`/items/search?q=${encodeURIComponent(query)}`); }

export async function uploadRFP(file: File) {
	const formData = new FormData();
	formData.append("file", file);
    // Explicitly call getAuthHeaders here as we are using raw fetch, not getJSON
    const headers = getAuthHeaders() as any;
    const res = await fetch(`${BASE_URL}/quotation/upload`, { 
        method: "POST", 
        body: formData, 
        headers: { 
            "x-user-id": headers["x-user-id"] || "", 
            "x-user-email": headers["x-user-email"] || "",
            "Authorization": headers["Authorization"] || ""
        } 
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
}

export async function getQuotations() { return getJSON("/quotation/list"); }
export async function getQuotation(id: number) { return getJSON(`/quotation/${id}`); }
export async function updateQuotation(id: number, payload: any) { return getJSON(`/quotation/${id}/update`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function rematchQuotation(id: number, requirements: any[]) { return getJSON(`/quotation/${id}/rematch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requirements) }); }
export async function setQuotationStatus(id: number, status: string) { return getJSON(`/quotation/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); }

export async function getOpportunities() { return getJSON("/opportunities"); }
export async function addOpportunity(payload: any) { return getJSON("/opportunities/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function updateOpportunity(id: number, payload: any) { return getJSON(`/opportunities/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function searchOpportunities(query: string) { return getJSON(`/opportunities/search?q=${encodeURIComponent(query)}`); }
export async function getActivity(query: string = "") { const url = query ? `/activity?q=${encodeURIComponent(query)}` : "/activity"; return getJSON(url); }

// --- Discussion API ---
export async function getQuotationComments(id: number) { return getJSON(`/quotation/${id}/comments`); }

export async function uploadCommentAttachment(id: number, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    
    // Explicitly call getAuthHeaders here as we are using raw fetch, not getJSON
    // Note: We do NOT set Content-Type header here manually. fetch+FormData does it automatically with boundary.
    const headers = getAuthHeaders() as any;
    
    const res = await fetch(`${BASE_URL}/quotation/${id}/comments/upload`, {
        method: "POST",
        body: formData,
        headers: {
            "x-user-id": headers["x-user-id"] || "",
            "x-user-email": headers["x-user-email"] || "",
            "Authorization": headers["Authorization"] || ""
        }
    });
    
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
}

export async function addQuotationComment(id: number, message: string, isInternal: boolean = false, attachments: any[] = []) { 
    return getJSON(`/quotation/${id}/comments`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ message, is_internal: isInternal, attachments }) 
    }); 
}

// --- Version Control API ---
export async function createQuotationVersion(id: number, changeReason: string) {
    return getJSON(`/quotation/${id}/version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change_reason: changeReason })
    });
}

export async function getQuotationHistory(id: number) {
    return getJSON(`/quotation/${id}/versions`);
}

export async function getQuotationVersion(id: number, version: number) {
    return getJSON(`/quotation/${id}/versions/${version}`);
}

// --- External Search (Tavily) ---
export async function searchExternalProduct(query: string) { return getJSON(`/external/search-product?query=${encodeURIComponent(query)}`); }

// --- RAG API ---
export async function getRagSessions() { return getJSON("/rag/sessions"); }
export async function getRagSessionHistory(sessionId: string) { return getJSON(`/rag/history/${sessionId}`); }
export async function chatRag(query: string, sessionId?: string) {
    return getJSON("/rag/chat", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ query, session_id: sessionId }) 
    }); 
}

// --- DB Chat API ---
export async function chatDb(query: string, sessionId?: string | null) {
    return getJSON("/db-chat/message", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ query, session_id: sessionId }) 
    }); 
}

// --- Visual Search & Uploads ---
export async function visualSearch(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/visual-search/search`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Visual search failed');
    return res.json();
}

export async function uploadProductImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/items/upload-image`, { method: "POST", body: formData });
    if (!res.ok) throw new Error("Image upload failed");
    return res.json(); 
}

// Legacy exports
export const getItems = getProducts;
export const addItem = addProduct;
export const embedAllItems = embedAllProducts;
export async function getRecommendations(userId: number) { return getJSON(`/recommend/${userId}`); }
export async function getAbTestSummary() { return getJSON("/abtest/summary"); }