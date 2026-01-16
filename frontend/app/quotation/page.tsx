"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { getQuotations, uploadRFP } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard"; // Import Guard

// ... (Keep existing Chart & Icon components) ...
// --- Simple SVG Charts (No external deps) ---
const SimplePieChart = ({ data }: { data: { label: string, value: number, color: string }[] }) => {
    const total = data.reduce((acc, item) => acc + item.value, 0);
    if (total === 0) return <div className="h-32 flex items-center justify-center text-slate-400 text-xs">No data</div>;
    let currentAngle = 0;
    return (
        <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 rounded-full overflow-hidden shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    {data.map((slice, i) => {
                        const angle = (slice.value / total) * 360;
                        const largeArc = angle > 180 ? 1 : 0;
                        const x1 = 50 + 50 * Math.cos(Math.PI * currentAngle / 180);
                        const y1 = 50 + 50 * Math.sin(Math.PI * currentAngle / 180);
                        const x2 = 50 + 50 * Math.cos(Math.PI * (currentAngle + angle) / 180);
                        const y2 = 50 + 50 * Math.sin(Math.PI * (currentAngle + angle) / 180);
                        const path = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`;
                        currentAngle += angle;
                        return <path key={i} d={path} fill={slice.color} stroke="white" strokeWidth="2" />;
                    })}
                    <circle cx="50" cy="50" r="30" fill="white" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-slate-700 text-sm">{total}</div>
            </div>
            <div className="space-y-2">
                {data.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                        <span className="text-slate-600 font-medium">{item.label}</span>
                        <span className="text-slate-400">({((item.value / total) * 100).toFixed(0)}%)</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
// --- Icons ---
const GridIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>;
const ListIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>;
const FolderIcon = () => <svg className="w-8 h-8 text-blue-200" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>;
const BriefcaseIcon = () => <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
const BulbIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>;

export default function QuotationDashboard() {
    const router = useRouter();
    const [quotations, setQuotations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    
    // View State
    const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

    // Pagination & Search
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = viewMode === "grid" ? 9 : 8;

    // Metrics
    const [metrics, setMetrics] = useState({
        totalCount: 0,
        totalValue: 0,
        pendingCount: 0,
        sentCount: 0,
        statusDist: [] as any[]
    });

    useEffect(() => {
        loadQuotations();
    }, []);

    async function loadQuotations() {
        try {
            const data = await getQuotations();
            const safeData = Array.isArray(data) ? data : [];
            setQuotations(safeData);
            
            const totalVal = safeData.reduce((acc: number, q: any) => acc + (q.total_price || 0), 0);
            const pending = safeData.filter((q: any) => q.status === 'draft' || q.status === 're_changes').length;
            const sent = safeData.filter((q: any) => q.status === 'sent').length;
            const drafts = safeData.filter((q: any) => q.status === 'draft').length;
            
            setMetrics({
                totalCount: safeData.length,
                totalValue: totalVal,
                pendingCount: pending,
                sentCount: sent,
                statusDist: [
                    { label: 'Sent', value: sent, color: '#10b981' }, 
                    { label: 'Drafts', value: drafts, color: '#94a3b8' }, 
                    { label: 'Review', value: pending - drafts, color: '#f59e0b' } 
                ]
            });
            setError("");
        } catch (e: any) {
            console.error("Failed to load:", e);
            setError(e.message || "Failed to load quotations.");
        } finally {
            setLoading(false);
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setUploading(true);
        setError("");
        try {
            const newQ = await uploadRFP(e.target.files[0]);
            router.push(`/quotation/${newQ.id}`);
        } catch (err: any) {
            setError(err.message || "Upload failed");
            setUploading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'draft': return 'bg-gray-100 text-gray-600 border-gray-200';
            case 'saved': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'created': return 'bg-purple-50 text-purple-600 border-purple-100';
            case 'sent': return 'bg-green-50 text-green-600 border-green-100';
            case 're_changes': return 'bg-orange-50 text-orange-600 border-orange-100';
            default: return 'bg-gray-50 text-gray-500 border-gray-100';
        }
    };

    // Filter & Pagination
    const filteredQuotations = quotations.filter(q => 
        (q.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) || "") ||
        (q.rfp_title?.toLowerCase().includes(searchTerm.toLowerCase()) || "") ||
        (q.id.toString().includes(searchTerm))
    );

    const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);
    const paginatedQuotations = filteredQuotations.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) setCurrentPage(page);
    };
    
    const getProductCount = (q: any) => {
        if (q.content?.matches) return q.content.matches.length;
        if (q.content?.requirements) return q.content.requirements.length;
        return 0;
    };

    // WRAPPER: Use AuthGuard
    return (
        <AuthGuard>
            <div className="min-h-screen bg-slate-50/50 pb-20">
                <Navbar />
                <div className="max-w-7xl mx-auto px-6">
                    
                    {/* Header & Quick Action */}
                    <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 mb-2">Quotation Dashboard</h1>
                            <p className="text-slate-500">Real-time overview of your RFP pipeline.</p>
                        </div>
                        <div className="flex gap-3">
                            {/* NEW: Daily Digest Link */}
                            <button 
                                onClick={() => router.push('/daily-digest')}
                                className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-all hover:text-brand"
                            >
                                <span>📊</span> Daily Digest
                            </button>

                            <label className={`
                                flex items-center gap-3 px-6 py-3 rounded-xl font-bold text-white shadow-lg shadow-brand/20 cursor-pointer transition-all hover:scale-105 active:scale-95
                                ${uploading ? 'bg-slate-400 cursor-wait' : 'bg-brand hover:bg-brand-dark'}
                            `}>
                                {uploading ? <LoadingSpinner size="sm" /> : (
                                    <>
                                        <span className="text-xl">+</span>
                                        <span>New Quotation (Upload PDF)</span>
                                    </>
                                )}
                                <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={uploading} />
                            </label>
                        </div>
                    </div>

                    {/* --- Executive Summary Section --- */}
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 mb-8 text-white shadow-lg">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                            <BriefcaseIcon /> Daily Briefing
                        </h2>
                        <div className="flex flex-col md:flex-row gap-8 justify-between items-center">
                            <div className="flex-1">
                                <p className="text-2xl font-light leading-relaxed">
                                    You have <span className="font-bold text-brand text-yellow-400">{metrics.pendingCount} quotations</span> pending review worth <span className="font-bold text-white">${(metrics.totalValue / 1000).toFixed(1)}k</span>. 
                                    Your conversion rate is trending at <span className="font-bold text-green-400">{(metrics.sentCount / (metrics.totalCount || 1) * 100).toFixed(0)}%</span> this month.
                                </p>
                            </div>
                            <div className="hidden md:block h-12 w-px bg-slate-700"></div>
                            <div className="flex gap-8">
                                <div className="text-center">
                                    <div className="text-3xl font-bold">{metrics.totalCount}</div>
                                    <div className="text-xs text-slate-400 uppercase tracking-wide mt-1">Total Jobs</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-green-400">{metrics.sentCount}</div>
                                    <div className="text-xs text-slate-400 uppercase tracking-wide mt-1">Sent</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* KPI & Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
                        {/* Left: KPI Grid */}
                        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <div className="text-sm text-slate-500 font-medium mb-1">Total Pipeline Value</div>
                                <div className="text-3xl font-bold text-slate-800">${(metrics.totalValue / 1000).toFixed(1)}k</div>
                                <div className="text-xs text-green-600 font-bold mt-2">▲ 12% vs last month</div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <div className="text-sm text-slate-500 font-medium mb-1">Active Drafts</div>
                                <div className="text-3xl font-bold text-slate-800">{metrics.statusDist.find(s => s.label === 'Drafts')?.value || 0}</div>
                                <div className="text-xs text-slate-400 mt-2">Work in progress</div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <div className="text-sm text-slate-500 font-medium mb-1">Pending Review</div>
                                <div className="text-3xl font-bold text-orange-500">{metrics.pendingCount}</div>
                                <div className="text-xs text-slate-400 mt-2">Requires attention</div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <div className="text-sm text-slate-500 font-medium mb-1">Total Projects</div>
                                <div className="text-3xl font-bold text-blue-600">{metrics.totalCount}</div>
                                <div className="text-xs text-slate-400 mt-2">Active + Archived</div>
                            </div>
                        </div>

                        {/* Right: Pie Chart */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
                            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wide">Status Distribution</h3>
                            <SimplePieChart data={metrics.statusDist} />
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 text-red-600 border border-red-200 rounded-lg flex items-center gap-3">
                            <span className="text-xl">⚠️</span> {error}
                        </div>
                    )}

                    {/* Main Content Area */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
                        <div className="px-8 py-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/30">
                            <div className="flex items-center gap-4">
                                <h2 className="font-bold text-lg text-slate-800">Projects</h2>
                                {/* View Toggle */}
                                <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                                    <button 
                                        onClick={() => setViewMode("grid")}
                                        className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-slate-100 text-brand" : "text-slate-400 hover:text-slate-600"}`}
                                    >
                                        <GridIcon />
                                    </button>
                                    <button 
                                        onClick={() => setViewMode("list")}
                                        className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-slate-100 text-brand" : "text-slate-400 hover:text-slate-600"}`}
                                    >
                                        <ListIcon />
                                    </button>
                                </div>
                            </div>
                            <div className="relative w-full md:w-64">
                                <input 
                                    type="text" 
                                    placeholder="Search client or project..." 
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-colors"
                                />
                                <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
                            </div>
                        </div>
                        
                        {/* Content View Switcher */}
                        {paginatedQuotations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <div className="bg-slate-50 p-4 rounded-full mb-3 text-2xl">📄</div>
                                <p className="text-lg font-medium text-slate-600">No quotations found</p>
                                {searchTerm ? <p className="text-sm">Try a different search term.</p> : <p className="text-sm mb-4">Upload an RFP PDF to get started.</p>}
                            </div>
                        ) : (
                            viewMode === "list" ? (
                                // --- LIST VIEW ---
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                                            <tr>
                                                <th className="px-8 py-4 pl-8">Client / Project</th>
                                                <th className="px-6 py-4">Ref ID</th>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4">Products</th> {/* NEW COLUMN */}
                                                <th className="px-6 py-4">Value</th>
                                                <th className="px-6 py-4">Created By</th>
                                                <th className="px-6 py-4">Date</th>
                                                <th className="px-6 py-4 text-right pr-8">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {paginatedQuotations.map((q) => (
                                                <tr key={q.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer" onClick={() => router.push(`/quotation/${q.id}`)}>
                                                    <td className="px-8 py-5">
                                                        <div className="font-bold text-slate-800">{q.client_name || "Unknown Client"}</div>
                                                        <div className="text-xs text-slate-500 font-medium truncate max-w-[180px] mt-0.5">{q.rfp_title}</div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">#{q.id.toString().padStart(4, '0')}</span>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getStatusColor(q.status)}`}>
                                                            {q.status.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                            <BulbIcon /> {getProductCount(q)}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5 font-mono font-bold text-slate-700">
                                                        ${(q.total_price || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">EL</div>
                                                            <span className="text-sm text-slate-600">Elango</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-5 text-sm text-slate-500 font-medium">
                                                        {q.updated_at ? new Date(q.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "-"}
                                                    </td>
                                                    <td className="px-6 py-5 text-right pr-8">
                                                        <button className="text-xs font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded hover:bg-brand hover:text-white hover:border-brand transition-all">
                                                            Open
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                // --- GRID VIEW (CARDS) ---
                                <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {paginatedQuotations.map((q) => (
                                        <div 
                                            key={q.id} 
                                            className="bg-white rounded-xl border border-slate-200 hover:border-brand/50 hover:shadow-lg transition-all cursor-pointer group flex flex-col h-full"
                                            onClick={() => router.push(`/quotation/${q.id}`)}
                                        >
                                            <div className="p-6 flex-1">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                                                        <FolderIcon />
                                                    </div>
                                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase border ${getStatusColor(q.status)}`}>
                                                        {q.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                
                                                <h3 className="font-bold text-slate-800 text-lg mb-1 truncate">{q.client_name || "Unknown Client"}</h3>
                                                <p className="text-xs text-slate-500 mb-4 h-8 overflow-hidden line-clamp-2">{q.rfp_title}</p>
                                                
                                                <div className="flex justify-between items-center text-sm border-t border-slate-50 pt-4">
                                                    <span className="font-mono font-bold text-slate-700">${(q.total_price || 0).toLocaleString()}</span>
                                                    
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">
                                                        <BulbIcon /> {getProductCount(q)} Products
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-slate-50 p-3 text-center border-t border-slate-100 rounded-b-xl group-hover:bg-brand group-hover:text-white transition-colors">
                                                <span className="text-xs font-bold uppercase tracking-wider">Open Project →</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="px-8 py-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/30">
                                <button onClick={(e) => { e.stopPropagation(); handlePageChange(currentPage - 1); }} disabled={currentPage === 1} className="text-sm text-slate-500 hover:text-brand disabled:opacity-50 disabled:cursor-not-allowed font-medium">← Previous</button>
                                <span className="text-xs text-slate-400 font-medium">Page {currentPage} of {totalPages}</span>
                                <button onClick={(e) => { e.stopPropagation(); handlePageChange(currentPage + 1); }} disabled={currentPage === totalPages} className="text-sm text-slate-500 hover:text-brand disabled:opacity-50 disabled:cursor-not-allowed font-medium">Next →</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}