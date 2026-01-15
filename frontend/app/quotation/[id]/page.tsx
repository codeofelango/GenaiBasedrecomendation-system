"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { getQuotation, updateQuotation, setQuotationStatus, rematchQuotation, getOpportunities, searchProducts, searchExternalProduct, getQuotationComments } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ProductImage } from "@/components/ProductImage";
import { ValueEngineeringPanel } from "@/components/ValueEngineeringPanel";
import { ProfitabilityCard } from "@/components/ProfitabilityCard";
import { EnergyROICalculator } from "@/components/EnergyROICalculator";
import { UpsellRecommendations } from "@/components/UpsellRecommendations";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";

// --- TYPES ---
type MatchCandidate = { id: number; title: string; description: string; price: number; score: number; image_url?: string; };
type QuotationItem = { 
    product_id?: number; 
    product_title: string; 
    product_description?: string; 
    requirement_id?: string; 
    quantity: number; 
    price: number; 
    unit_price: number; 
    unit_cost?: number; 
    reasoning?: string; 
    image_url?: string; 
    alternatives?: MatchCandidate[];
    wattage?: number; 
};
type Requirement = { id: string; description: string; Fixture_Type?: string; Wattage?: string; Color_Temperature?: string; IP_Rating?: string; Beam_Angle?: string; Lumen_Output?: string; type_id?: string; };

async function sendQuotationEmail(id: number, email: string) {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    const headers: any = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (userStr) {
        const u = JSON.parse(userStr);
        headers["x-user-id"] = u.id.toString();
        headers["x-user-email"] = u.email;
    }
    const res = await fetch(`http://localhost:8000/quotation/${id}/send`, { method: "POST", headers: headers, body: JSON.stringify({ email }) });
    if (!res.ok) throw new Error("Failed to send email");
    return res.json();
}

async function downloadPDF(id: number) {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    const headers: any = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (userStr) {
        const u = JSON.parse(userStr);
        headers["x-user-id"] = u.id.toString();
        headers["x-user-email"] = u.email;
    }
    const res = await fetch(`http://localhost:8000/quotation/${id}/download`, { headers });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quotation_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export default function QuotationEditor() {
    const { id } = useParams();
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [recipientEmail, setRecipientEmail] = useState("");
    const [activeTab, setActiveTab] = useState<"specs" | "pricing" | "roi" | "finalize">("specs");
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [items, setItems] = useState<QuotationItem[]>([]);
    const [clientName, setClientName] = useState("");
    const [clientOptions, setClientOptions] = useState<string[]>([]);
    const [commentCount, setCommentCount] = useState(0);
    
    // Advanced feature state
    const [globalMargin, setGlobalMargin] = useState<number>(30); 

    // --- SEARCH STATE ---
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [activeReqIndex, setActiveReqIndex] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // --- WEB SEARCH STATE (TAVILY) ---
    const [webSearchModalOpen, setWebSearchModalOpen] = useState(false);
    const [webSearchResults, setWebSearchResults] = useState<any[]>([]);
    const [isWebSearching, setIsWebSearching] = useState(false);
    const [webSearchQuery, setWebSearchQuery] = useState("");

    useEffect(() => { 
        if (id) {
            loadData(false);
            // Polling for real-time updates (comments & status)
            const interval = setInterval(() => loadData(true), 5000);
            return () => clearInterval(interval);
        }
    }, [id]);

    async function loadData(isRefresh = false) {
        try {
            const [q, ops, comments] = await Promise.all([
                getQuotation(Number(id)), 
                !isRefresh ? getOpportunities().catch(() => []) : Promise.resolve([]),
                getQuotationComments(Number(id)).catch(() => [])
            ]);
            
            if (Array.isArray(comments)) {
                setCommentCount(comments.length);
            }

            if (!isRefresh) {
                // Initial Load: Full state population
                setData(q);
                setClientName(q.content?.client_name || q.client_name || "");
                setClientOptions(Array.from(new Set(ops.map((o: any) => o.client_name))).filter(Boolean) as string[]);
                setRequirements(q.content?.requirements || []);
                
                const mappedItems = (q.content?.matches || []).map((m: any) => {
                    const unitPrice = m.unit_price || (m.price / (m.quantity || 1)) || m.price || 0;
                    // Basic wattage extraction from description for ROI
                    const wattageMatch = (m.product_description || "").match(/(\d+)\s*W/i);
                    const estimatedWattage = wattageMatch ? parseInt(wattageMatch[1]) : 20;

                    return {
                        ...m,
                        quantity: m.quantity || 1,
                        unit_price: unitPrice,
                        unit_cost: m.unit_cost || (unitPrice * 0.6),
                        price: m.price || (unitPrice * (m.quantity || 1)),
                        image_url: m.image_url || "",
                        alternatives: m.alternatives || [],
                        wattage: estimatedWattage
                    };
                });
                setItems(mappedItems);
                if (q.status === 'sent' || q.status === 'finalized') setActiveTab("finalize");
            } else {
                // Real-time update: Only status and metadata to avoid overwriting edits
                setData((prev: any) => ({
                    ...prev,
                    status: q.status,
                    rfp_title: q.rfp_title,
                    updated_at: q.updated_at
                }));
            }
        } catch (err) { console.error(err); } 
        finally { if (!isRefresh) setLoading(false); }
    }

    const handleSpecChange = (idx: number, field: string, value: string) => { 
        const newReqs = [...requirements]; 
        newReqs[idx] = { ...newReqs[idx], [field]: value }; 
        setRequirements(newReqs); 
    };
    
    const handleRegenerateMatches = async () => { 
        setSaving(true); 
        try { 
            const res = await rematchQuotation(Number(id), requirements); 
            const newMappedItems = (res.matches || []).map((m: any) => {
                const uPrice = m.unit_price || 0;
                const wattageMatch = (m.product_description || "").match(/(\d+)\s*W/i);
                return { 
                    ...m, 
                    quantity: m.quantity || 1, 
                    unit_price: uPrice, 
                    unit_cost: uPrice * 0.6,
                    image_url: m.image_url || "", 
                    alternatives: m.alternatives || [],
                    wattage: wattageMatch ? parseInt(wattageMatch[1]) : 20
                };
            }); 
            setItems(newMappedItems); 
            setData((prev: any) => ({...prev, total_price: res.total_price})); 
            alert("Matches regenerated!"); 
        } catch (e) { 
            alert("Failed to regenerate."); 
        } finally { 
            setSaving(false); 
        } 
    };

    const handleSelectAlternative = (matchIdx: number, alt: any) => { 
        const newItems = [...items]; 
        const oldQty = newItems[matchIdx].quantity;
        const wattageMatch = (alt.description || "").match(/(\d+)\s*W/i);
        newItems[matchIdx] = { 
            ...newItems[matchIdx], 
            product_id: alt.id, 
            product_title: alt.title, 
            product_description: alt.description, 
            unit_price: alt.price, 
            unit_cost: alt.price * 0.6,
            price: alt.price * oldQty, 
            image_url: alt.image_url, 
            reasoning: `VE Swap: ${alt.title}`,
            alternatives: newItems[matchIdx].alternatives,
            wattage: wattageMatch ? parseInt(wattageMatch[1]) : 20
        }; 
        setItems(newItems); 
    };

    const handleAddUpsellItem = (item: any) => {
        setItems([...items, { ...item, unit_cost: item.unit_price * 0.5, wattage: 0 }]); 
    };

    const handleQuantityChange = (idx: number, newQty: number) => { 
        if (newQty < 1) return; 
        const newItems = [...items]; 
        newItems[idx].quantity = newQty; 
        newItems[idx].price = newQty * newItems[idx].unit_price; 
        setItems(newItems); 
    };

    const handlePriceChange = (idx: number, newPrice: number) => { 
        const newItems = [...items]; 
        newItems[idx].unit_price = newPrice; 
        newItems[idx].price = newItems[idx].quantity * newPrice; 
        setItems(newItems); 
    };

    const handleCostChange = (idx: number, newCost: number) => {
        const newItems = [...items];
        newItems[idx].unit_cost = newCost;
        setItems(newItems);
    };

    const applyGlobalMargin = () => {
        const newItems = items.map(item => {
            const cost = item.unit_cost || 0;
            const newPrice = cost / (1 - (globalMargin / 100));
            return {
                ...item,
                unit_price: newPrice,
                price: newPrice * item.quantity
            };
        });
        setItems(newItems);
    };
    
    const savePricingChanges = async () => { 
        setSaving(true); 
        try { 
            const payload = { 
                client_name: clientName, 
                items: items.map(i => ({ 
                    product_id: i.product_id, 
                    quantity: i.quantity, 
                    unit_price: i.unit_price || 0,
                })) 
            }; 
            await updateQuotation(Number(id), payload); 
            setData((prev: any) => ({ ...prev, total_price: calculateTotal() })); 
            return true; 
        } catch (e) { 
            alert("Failed to save."); 
            return false; 
        } finally { 
            setSaving(false); 
        } 
    };

    const handleSendEmail = async () => {
        if (!recipientEmail) { alert("Enter email."); return; }
        setSaving(true);
        try { await sendQuotationEmail(Number(id), recipientEmail); alert("Sent!"); loadData(false); } catch (e) { alert("Failed to send."); } finally { setSaving(false); }
    };

    const handleFinalize = async () => {
        setSaving(true);
        try { await setQuotationStatus(Number(id), "finalized"); alert("Quotation finalized!"); loadData(false); } catch (e) { alert("Failed to finalize."); } finally { setSaving(false); }
    };

    const handleDownload = async () => {
        try { await downloadPDF(Number(id)); } catch (e) { alert("Download failed"); }
    };

    // --- SEARCH LOGIC ---
    const openSearchModal = (idx: number, initialQuery: string) => {
        setActiveReqIndex(idx);
        setSearchQuery(initialQuery || "");
        setSearchModalOpen(true);
        setSearchResults([]);
        if (initialQuery) performSearch(initialQuery);
    };

    const performSearch = async (q: string) => {
        setIsSearching(true);
        try {
            const res = await searchProducts(q);
            setSearchResults(res);
        } catch(e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const selectProductFromSearch = (product: any) => {
        if (activeReqIndex === null) return;
        
        const req = requirements[activeReqIndex];
        const newItems = [...items];
        
        // Find if this req already has a match item
        const existingItemIndex = newItems.findIndex(m => m.requirement_id === req.id || m.requirement_id === req.type_id);
        
        const wattageMatch = (product.description || "").match(/(\d+)\s*W/i);
        const estimatedWattage = wattageMatch ? parseInt(wattageMatch[1]) : 20;
        
        const newItemData = {
            requirement_id: req.id || req.type_id,
            product_id: product.id,
            product_title: product.title,
            product_description: product.description,
            unit_price: product.price,
            unit_cost: product.price * 0.6, // Default margin assumption
            quantity: req.Qty ? Number(req.Qty) : 1,
            price: (req.Qty ? Number(req.Qty) : 1) * product.price,
            image_url: product.image_url,
            reasoning: "Manual Selection",
            alternatives: [],
            wattage: estimatedWattage
        };

        if (existingItemIndex >= 0) {
            // Update existing
            newItems[existingItemIndex] = {
                ...newItems[existingItemIndex],
                ...newItemData,
                // Preserve quantity from current item if desired, or reset to req
                quantity: newItems[existingItemIndex].quantity
            };
            newItems[existingItemIndex].price = newItems[existingItemIndex].quantity * newItemData.unit_price;
        } else {
            // Add new
            newItems.push(newItemData);
        }

        setItems(newItems);
        setSearchModalOpen(false);
    };

    // --- WEB SEARCH LOGIC (TAVILY) ---
    const buildWebSearchQuery = (req: any) => {
        // Construct a detailed search query including description and all attributes
        return [
            req.Fixture_Type,
            req.Description || req.description,
            req.Wattage,
            req.Color_Temperature,
            req.Lumen_Output,
            req.IP_Rating,
            req.Beam_Angle
        ].filter(Boolean).join(" ");
    };

    const openWebSearchModal = (initialQuery: string) => {
        setWebSearchQuery(initialQuery || "");
        setWebSearchModalOpen(true);
        setWebSearchResults([]);
        if (initialQuery) performWebSearch(initialQuery);
    };

    const performWebSearch = async (q: string) => {
        setIsWebSearching(true);
        try {
            const res = await searchExternalProduct(q);
            setWebSearchResults(res.results || []);
        } catch(e) {
            console.error(e);
        } finally {
            setIsWebSearching(false);
        }
    };

    const calculateTotal = () => items.reduce((acc, item) => acc + (item.price || 0), 0);
    const calculateTotalCost = () => items.reduce((acc, item) => acc + ((item.unit_cost || 0) * item.quantity), 0);
    const calculateTotalWattage = () => items.reduce((acc, item) => acc + ((item.wattage || 0) * item.quantity), 0);

    if (loading) return <div className="min-h-screen bg-slate-50 flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
    if (!data) return <div className="p-10 text-center">Quotation not found</div>;

    return (
        <AuthGuard>
            <div className="min-h-screen bg-slate-50 pb-20">
                <Navbar />
                
                {/* Header */}
                <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                    <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <button onClick={() => router.push('/quotation')} className="text-slate-400 hover:text-slate-600 font-medium">← Back</button>
                            <div>
                                <h1 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                    {data.rfp_title}
                                    <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded">#{data.id}</span>
                                </h1>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className={`font-bold uppercase ${data.status === 'sent' ? 'text-green-600' : 'text-brand'}`}>{data.status}</span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-slate-500">{items.length} Line Items</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => router.push(`/quotation/${id}/discuss`)}
                                className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 hover:text-brand flex items-center gap-2 transition-all relative"
                            >
                                <span>💬</span> Discuss
                                {commentCount > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full shadow-sm animate-bounce">
                                        {commentCount}
                                    </span>
                                )}
                            </button>
                            {saving && <span className="text-sm text-brand animate-pulse flex items-center font-bold">Saving...</span>}
                            {activeTab === 'finalize' && (<button onClick={handleDownload} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 flex items-center gap-2 shadow-lg"><span>⬇</span> PDF</button>)}
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-6 py-8">
                    {/* Stepper / Tabs */}
                    <div className="flex gap-4 md:gap-8 mb-8 border-b border-slate-200 px-2 overflow-x-auto">
                        <button onClick={() => setActiveTab("specs")} className={`pb-3 font-bold text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'specs' ? 'text-brand border-b-2 border-brand' : 'text-slate-400 hover:text-slate-600'}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${activeTab === 'specs' ? 'bg-brand text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
                            Product Selection
                        </button>
                        <button onClick={() => setActiveTab("pricing")} className={`pb-3 font-bold text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'pricing' ? 'text-brand border-b-2 border-brand' : 'text-slate-400 hover:text-slate-600'}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${activeTab === 'pricing' ? 'bg-brand text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                            Commercial
                        </button>
                        <button onClick={() => setActiveTab("roi")} className={`pb-3 font-bold text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'roi' ? 'text-brand border-b-2 border-brand' : 'text-slate-400 hover:text-slate-600'}`}>
                             <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${activeTab === 'roi' ? 'bg-brand text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
                            Energy & ROI
                        </button>
                        <button onClick={async () => { await savePricingChanges(); setActiveTab("finalize"); }} className={`pb-3 font-bold text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'finalize' ? 'text-brand border-b-2 border-brand' : 'text-slate-400 hover:text-slate-600'}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${activeTab === 'finalize' ? 'bg-brand text-white' : 'bg-slate-200 text-slate-500'}`}>4</span>
                            Review & Send
                        </button>
                    </div>

                    {/* --- TAB 1: PRODUCT SELECTION --- */}
                    {activeTab === 'specs' && (
                        <div className="animate-fade-in space-y-6">
                            {/* Upsell Widget */}
                            <UpsellRecommendations items={items} onAddItem={handleAddUpsellItem} />
                            
                            {/* Value Engineering Panel */}
                            <ValueEngineeringPanel items={items} onSwap={handleSelectAlternative} />

                            <div className="flex justify-between items-center mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <h2 className="font-bold text-slate-800">Specification Matching</h2>
                                <button onClick={handleRegenerateMatches} className="text-xs font-bold text-brand hover:underline flex items-center gap-1">
                                    <span>↻</span> Re-run AI Matcher
                                </button>
                            </div>

                            {requirements.map((req: any, i: number) => {
                                const match = (items || []).find((m: any) => m.requirement_id === req.id || m.requirement_id === req.type_id);
                                return (
                                    <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col lg:flex-row hover:shadow-md transition-all group">
                                        {/* Left: Spec Attributes Box (PRESERVED) */}
                                        <div className="flex-1 p-6 border-b lg:border-b-0 lg:border-r border-slate-100 bg-slate-50/50">
                                            <div className="flex items-center gap-3 mb-4">
                                                <span className="bg-slate-800 text-white text-xs font-bold px-3 py-1 rounded shadow-sm">{req.type_id || req.id || `#${i+1}`}</span>
                                                <input type="text" value={req.Fixture_Type || ""} onChange={(e) => handleSpecChange(i, "Fixture_Type", e.target.value)} className="font-bold text-slate-700 text-sm border-b border-transparent hover:border-slate-300 focus:border-brand bg-transparent outline-none flex-1 transition-colors" placeholder="Fixture Type"/>
                                                
                                                {/* SEARCH BUTTON INTEGRATION */}
                                                <div className="flex items-center gap-1">
                                                    <button 
                                                        onClick={() => openSearchModal(i, req.Fixture_Type || req.description || req.Description)}
                                                        className="p-2 text-slate-400 hover:text-brand transition-colors bg-white rounded-lg border border-slate-200 shadow-sm"
                                                        title="Search Product Catalog"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                    </button>
                                                    
                                                    {/* NEW WEB SEARCH BUTTON */}
                                                    <button 
                                                        onClick={() => openWebSearchModal(buildWebSearchQuery(req))}
                                                        className="p-2 text-slate-400 hover:text-blue-600 transition-colors bg-white rounded-lg border border-slate-200 shadow-sm"
                                                        title="Search Web (Tavily)"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea value={req.Description || req.description || ""} onChange={(e) => handleSpecChange(i, "description", e.target.value)} className="w-full text-sm text-slate-600 mb-4 p-2 border border-slate-200 rounded bg-white outline-none focus:border-brand" rows={3}/>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                                <div className="space-y-1"><label className="text-slate-400 text-[10px] uppercase font-bold">Watts</label><input type="text" value={req.Wattage || ""} onChange={(e) => handleSpecChange(i, "Wattage", e.target.value)} className="w-full p-1.5 border border-slate-200 rounded bg-white" /></div>
                                                <div className="space-y-1"><label className="text-slate-400 text-[10px] uppercase font-bold">CCT</label><input type="text" value={req.Color_Temperature || ""} onChange={(e) => handleSpecChange(i, "Color_Temperature", e.target.value)} className="w-full p-1.5 border border-slate-200 rounded bg-white" /></div>
                                                <div className="space-y-1"><label className="text-slate-400 text-[10px] uppercase font-bold">IP</label><input type="text" value={req.IP_Rating || ""} onChange={(e) => handleSpecChange(i, "IP_Rating", e.target.value)} className="w-full p-1.5 border border-slate-200 rounded bg-white" /></div>
                                                <div className="space-y-1"><label className="text-slate-400 text-[10px] uppercase font-bold">Beam</label><input type="text" value={req.Beam_Angle || ""} onChange={(e) => handleSpecChange(i, "Beam_Angle", e.target.value)} className="w-full p-1.5 border border-slate-200 rounded bg-white" /></div>
                                                <div className="space-y-1"><label className="text-slate-400 text-[10px] uppercase font-bold">Lumens</label><input type="text" value={req.Lumen_Output || ""} onChange={(e) => handleSpecChange(i, "Lumen_Output", e.target.value)} className="w-full p-1.5 border border-slate-200 rounded bg-white" /></div>
                                            </div>
                                        </div>
                                        
                                        {/* Right: Match */}
                                        <div className="flex-1 p-6 bg-white relative">
                                            {match ? (
                                                <>
                                                    <div className="flex gap-4 mb-4">
                                                        <ProductImage src={match.image_url} alt="Product" className="w-20 h-20 object-cover rounded-lg bg-gray-100 border border-slate-100" />
                                                        <div>
                                                            <h3 className="font-bold text-slate-800 text-base mb-1">{match.product_title}</h3>
                                                            <p className="text-xs text-slate-500 mb-2 line-clamp-2">{match.product_description}</p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">${match.unit_price}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Alternatives */}
                                                    {match.alternatives && match.alternatives.length > 0 && (
                                                        <div className="mt-4 border-t border-slate-100 pt-3">
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Alternates</div>
                                                            <div className="flex flex-col gap-2">
                                                                {match.alternatives.slice(0, 3).map((alt: any, idx: number) => (
                                                                    <button key={idx} onClick={() => handleSelectAlternative(items.indexOf(match), alt)} className="flex justify-between items-center text-left p-2 rounded-lg border border-slate-100 hover:border-brand/50 hover:bg-slate-50 transition-all group/alt">
                                                                        <div className="flex items-center gap-3">
                                                                            <ProductImage src={alt.image_url} alt="Alt" className="w-8 h-8 object-cover rounded bg-gray-100" />
                                                                            <div className="text-xs">
                                                                                <div className="font-semibold text-slate-700 group-hover/alt:text-brand">{alt.title}</div>
                                                                                <div className="text-slate-400">{(alt.score * 100).toFixed(0)}% Match</div>
                                                                            </div>
                                                                        </div>
                                                                        <span className="text-xs font-mono font-bold text-slate-600 group-hover/alt:text-brand">${alt.price}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (<div className="h-full flex items-center justify-center text-slate-400 text-sm italic">Pending...</div>)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* --- TAB 2: COMMERCIAL (PROFITABILITY) --- */}
                    {activeTab === 'pricing' && (
                        <div className="animate-fade-in space-y-6">
                            <ProfitabilityCard revenue={calculateTotal()} cost={calculateTotalCost()} />
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-slate-800">Global Pricing Strategy</h3>
                                    <button onClick={applyGlobalMargin} className="bg-brand text-white px-4 py-2 rounded-lg text-xs font-bold shadow hover:bg-brand-dark transition-all">Apply Strategy</button>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Target Margin: {globalMargin}%</label>
                                        <input type="range" min="0" max="80" value={globalMargin} onChange={(e) => setGlobalMargin(parseInt(e.target.value))} className="w-full accent-brand" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Client Name</label>
                                        <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="input-field w-full" placeholder="Enter client name..." list="client-options"/>
                                        <datalist id="client-options">{clientOptions.map((client, idx) => (<option key={idx} value={client} />))}</datalist>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">
                                        <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right bg-red-50/50 text-red-400">Unit Cost</th><th className="px-4 py-3 text-right bg-blue-50/50 text-blue-400">Unit Price</th><th className="px-4 py-3 text-right">Margin</th><th className="px-4 py-3 text-right font-extrabold text-slate-700">Total</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {items.map((item, idx) => {
                                            const itemMargin = item.unit_price > 0 ? ((item.unit_price - (item.unit_cost || 0)) / item.unit_price) * 100 : 0;
                                            return (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 max-w-xs"><div className="font-bold text-slate-800 truncate">{item.product_title}</div></td>
                                                <td className="px-4 py-3 text-center"><input type="number" min="1" value={item.quantity} onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value))} className="w-16 px-2 py-1 border border-slate-200 rounded text-center bg-white outline-none" /></td>
                                                <td className="px-4 py-3 text-right bg-red-50/10"><input type="number" value={item.unit_cost?.toFixed(2)} onChange={(e) => handleCostChange(idx, parseFloat(e.target.value))} className="w-24 px-2 py-1 border border-transparent hover:border-red-200 rounded text-right bg-transparent focus:bg-white focus:border-red-400 outline-none text-red-600 font-mono" /></td>
                                                <td className="px-4 py-3 text-right bg-blue-50/10"><input type="number" value={item.unit_price?.toFixed(2)} onChange={(e) => handlePriceChange(idx, parseFloat(e.target.value))} className="w-24 px-2 py-1 border border-transparent hover:border-blue-200 rounded text-right bg-transparent focus:bg-white focus:border-blue-400 outline-none font-mono font-bold text-blue-600" /></td>
                                                <td className="px-4 py-3 text-right"><span className={`text-xs font-bold px-2 py-1 rounded ${itemMargin < 20 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{itemMargin.toFixed(0)}%</span></td>
                                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">${(item.price || 0).toLocaleString()}</td>
                                            </tr>
                                        )})}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 3: ENERGY ROI (NEW) --- */}
                    {activeTab === 'roi' && (
                        <div className="animate-fade-in space-y-6">
                            <h2 className="text-2xl font-bold text-slate-800 mb-2">Investment & Energy Analysis</h2>
                            <p className="text-slate-500 mb-6">Analyze the return on investment for this LED upgrade based on typical energy usage.</p>
                            
                            <EnergyROICalculator totalNewWattage={calculateTotalWattage()} totalCost={calculateTotal()} />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                    <h3 className="font-bold text-slate-800 mb-4">Why upgrade?</h3>
                                    <ul className="space-y-3 text-sm text-slate-600">
                                        <li className="flex items-start gap-2"><span className="text-green-500">✔</span> <span>Reduce carbon footprint by approx {((calculateTotalWattage() * 12 * 260 * 0.4) / 1000).toFixed(0)}kg CO2 per year.</span></li>
                                        <li className="flex items-start gap-2"><span className="text-green-500">✔</span> <span>Lower maintenance costs (LEDs last 50,000+ hours).</span></li>
                                        <li className="flex items-start gap-2"><span className="text-green-500">✔</span> <span>Improved light quality and color rendering (CRI).</span></li>
                                    </ul>
                                </div>
                                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="text-4xl font-bold text-blue-600 mb-2">{(calculateTotalWattage() / 1000).toFixed(2)}kW</div>
                                        <div className="text-blue-400 text-sm font-bold uppercase tracking-wider">Total Connected Load</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 4: FINALIZE --- */}
                    {activeTab === 'finalize' && (
                        <div className="animate-fade-in max-w-4xl mx-auto">
                            <div className="bg-white shadow-2xl rounded-none md:rounded-lg overflow-hidden mb-8 print:shadow-none print:w-full">
                                <div className="bg-slate-900 text-white p-12 print:bg-white print:text-black print:p-0 print:border-b-2 print:border-black print:mb-8">
                                    <div className="flex justify-between"><div><h1 className="text-4xl font-bold mb-2">Quotation</h1><p className="opacity-75">#{data.id}</p></div><div className="text-right"><div className="text-2xl font-bold">{clientName || "Client"}</div><div className="text-sm opacity-75">{new Date().toLocaleDateString()}</div></div></div>
                                </div>
                                <div className="p-12 print:p-0">
                                    <table className="w-full mb-12">
                                        <thead><tr className="border-b-2 border-slate-800 text-left text-sm font-bold uppercase"><th className="py-3">Ref</th><th className="py-3 w-16">Img</th><th className="py-3">Description</th><th className="py-3 text-center">Qty</th><th className="py-3 text-right">Price</th><th className="py-3 text-right">Total</th></tr></thead>
                                        <tbody>
                                            {items.map((item, idx) => (
                                                <tr key={idx} className="border-b border-slate-200">
                                                    <td className="py-4 text-xs font-bold text-slate-500">{item.requirement_id || "-"}</td>
                                                    <td className="py-4"><ProductImage src={item.image_url} alt="Product" className="w-12 h-12 object-cover rounded bg-slate-100" /></td>
                                                    <td className="py-4"><div className="font-bold text-slate-800">{item.product_title}</div><div className="text-xs text-slate-500 mt-1">{item.product_description?.substring(0, 80)}...</div></td>
                                                    <td className="py-4 text-center">{item.quantity}</td>
                                                    <td className="py-4 text-right font-mono">${item.unit_price?.toLocaleString()}</td>
                                                    <td className="py-4 text-right font-mono font-bold">${item.price?.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="flex justify-end mb-12">
                                        <div className="w-64 space-y-2">
                                            <div className="flex justify-between text-slate-500 text-sm"><span>Subtotal</span><span>${calculateTotal().toLocaleString()}</span></div>
                                            <div className="flex justify-between text-slate-500 text-sm"><span>Tax (0%)</span><span>$0.00</span></div>
                                            <div className="flex justify-between py-4 text-xl font-bold text-slate-900 border-t border-slate-200 mt-2"><span>Total</span><span>${calculateTotal().toLocaleString()}</span></div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-400 text-center print:mt-12">Generated by Project Phoenix AI • Valid for 30 days</div>
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-4 print:hidden">
                                {data.status !== 'finalized' && data.status !== 'sent' ? (
                                    <button onClick={handleFinalize} disabled={saving} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all w-full max-w-md">Lock & Finalize Quotation</button>
                                ) : (
                                    <div className="flex gap-2 w-full max-w-md">
                                        <input type="email" placeholder="Client Email Address" className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-brand outline-none" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
                                        <button onClick={handleSendEmail} disabled={saving} className="bg-brand text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-brand-dark transition-all disabled:opacity-50 whitespace-nowrap">{saving ? 'Sending...' : 'Send to Client'}</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* --- SEARCH MODAL (INTERNAL) --- */}
                {searchModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-slate-800">Search Product Catalog</h3>
                                <button onClick={() => setSearchModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl leading-none">&times;</button>
                            </div>
                            <div className="p-4 border-b border-slate-100">
                                <form onSubmit={(e) => { e.preventDefault(); performSearch(searchQuery); }} className="flex gap-2">
                                    <input 
                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                                        placeholder="Search for fixtures..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        autoFocus
                                    />
                                    <button type="submit" disabled={isSearching} className="bg-brand text-white px-6 py-2 rounded-xl font-bold hover:bg-brand-dark transition-all">
                                        {isSearching ? "Searching..." : "Search"}
                                    </button>
                                </form>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                                {searchResults.length === 0 ? (
                                    <div className="text-center py-10 text-slate-400">
                                        {isSearching ? <LoadingSpinner size="sm" /> : "No results found. Try a different query."}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {searchResults.map((p) => (
                                            <div key={p.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex gap-3 hover:border-brand transition-colors cursor-pointer group" onClick={() => selectProductFromSearch(p)}>
                                                <ProductImage src={p.image_url} alt={p.title} className="w-16 h-16 rounded-lg bg-slate-100 object-cover shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-800 text-sm truncate group-hover:text-brand">{p.title}</div>
                                                    <div className="text-xs text-slate-500 line-clamp-1">{p.description}</div>
                                                    <div className="flex justify-between items-center mt-2">
                                                        <span className="font-mono font-bold text-slate-700 text-xs">${p.price}</span>
                                                        <button className="bg-brand/10 text-brand text-[10px] font-bold px-2 py-1 rounded hover:bg-brand hover:text-white transition-colors">Select</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- WEB SEARCH MODAL (TAVILY) --- */}
                {webSearchModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <span>🌍</span> Web Search (Tavily)
                                </h3>
                                <button onClick={() => setWebSearchModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl leading-none">&times;</button>
                            </div>
                            <div className="p-4 border-b border-slate-100">
                                <form onSubmit={(e) => { e.preventDefault(); performWebSearch(webSearchQuery); }} className="flex gap-2">
                                    <input 
                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                                        placeholder="Search web for specs, price..."
                                        value={webSearchQuery}
                                        onChange={(e) => setWebSearchQuery(e.target.value)}
                                        autoFocus
                                    />
                                    <button type="submit" disabled={isWebSearching} className="bg-slate-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-700 transition-all">
                                        {isWebSearching ? "Searching..." : "Go"}
                                    </button>
                                </form>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                                {webSearchResults.length === 0 ? (
                                    <div className="text-center py-10 text-slate-400">
                                        {isWebSearching ? <LoadingSpinner size="sm" /> : "No results. Search for something to see external results."}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {webSearchResults.map((res: any, idx: number) => (
                                            <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-brand/50 transition-colors">
                                                <a href={res.url} target="_blank" rel="noopener noreferrer" className="font-bold text-brand hover:underline text-base block mb-1">
                                                    {res.title}
                                                </a>
                                                <div className="text-xs text-green-700 mb-2 truncate">{res.url}</div>
                                                <p className="text-sm text-slate-600 leading-relaxed">{res.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}