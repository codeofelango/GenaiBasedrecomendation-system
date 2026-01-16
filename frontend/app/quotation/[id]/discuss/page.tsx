"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { AuthGuard } from "@/components/AuthGuard";
import { getQuotation, getQuotationComments, addQuotationComment, uploadCommentAttachment } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type Attachment = {
    name: string;
    url: string;
    type: string;
};

type Comment = {
    id: number;
    user_name: string;
    message: string;
    is_internal: boolean;
    created_at: string;
    attachments?: Attachment[];
};

export default function DiscussionPage() {
    const params = useParams();
    const router = useRouter();
    // Handle params.id possibly being string or array
    const rawId = params?.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const [quotation, setQuotation] = useState<any>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [newMessage, setNewMessage] = useState("");
    const [sending, setSending] = useState(false);
    
    // Attachment State
    const [uploading, setUploading] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    async function loadData() {
        try {
            const [q, c] = await Promise.all([
                getQuotation(Number(id)),
                getQuotationComments(Number(id))
            ]);
            setQuotation(q);
            setComments(c || []);
            scrollToBottom();
        } catch (e) {
            console.error("Failed to load discussion data", e);
        } finally {
            setLoading(false);
        }
    }

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        setUploading(true);
        
        try {
            const result = await uploadCommentAttachment(Number(id), file);
            setPendingAttachments(prev => [...prev, result]);
        } catch (error) {
            alert("Failed to upload file");
            console.error(error);
        } finally {
            setUploading(false);
            // Reset input so same file can be selected again if needed
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const removePendingAttachment = (index: number) => {
        setPendingAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!newMessage.trim() && pendingAttachments.length === 0) || uploading) return;
        
        setSending(true);
        try {
            // Check for @internal tag
            const isInternal = newMessage.includes("@internal");
            const cleanMessage = newMessage.replace("@internal", "").trim();
            
            await addQuotationComment(Number(id), cleanMessage, isInternal, pendingAttachments);
            
            setNewMessage("");
            setPendingAttachments([]);
            
            // Refresh comments
            const freshComments = await getQuotationComments(Number(id));
            setComments(freshComments || []);
            scrollToBottom();
        } catch (e) {
            alert("Failed to post comment");
        } finally {
            setSending(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex justify-center py-20"><LoadingSpinner size="lg" /></div>;

    return (
        <AuthGuard>
            <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
                <Navbar />
                
                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm z-10 flex-none">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => router.push(`/quotation/${id}`)}
                            className="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 text-sm font-bold"
                        >
                            <span>←</span> Back to Editor
                        </button>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <div>
                            <h1 className="font-bold text-slate-800 flex items-center gap-2">
                                {quotation?.rfp_title}
                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-xs font-normal">#{id}</span>
                            </h1>
                            <p className="text-xs text-slate-500">Discussion & Activity Log</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center border-2 border-white text-xs font-bold">JD</div>
                            <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center border-2 border-white text-xs font-bold">AS</div>
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center border-2 border-white text-xs font-bold">+</div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden max-w-7xl mx-auto w-full p-6 gap-6">
                    
                    {/* Main Chat Area */}
                    <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        
                        {/* Messages List */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                            {comments.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-2xl">
                                        💬
                                    </div>
                                    <p className="font-medium text-slate-600">Start the conversation</p>
                                    <p className="text-sm">Discuss requirements, pricing, or share files.</p>
                                </div>
                            ) : (
                                comments.map((c) => (
                                    <div key={c.id} className={`flex gap-4 group ${c.is_internal ? 'opacity-80' : ''}`}>
                                        <div className="flex-none">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ${c.is_internal ? 'bg-amber-500' : 'bg-brand'}`}>
                                                {c.user_name ? c.user_name.substring(0, 2).toUpperCase() : '??'}
                                            </div>
                                        </div>
                                        <div className="flex-1 max-w-3xl">
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <span className="font-bold text-slate-800">{c.user_name}</span>
                                                <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                                                {c.is_internal && (
                                                    <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-200">INTERNAL</span>
                                                )}
                                            </div>
                                            <div className="bg-white p-4 rounded-xl rounded-tl-none shadow-sm border border-slate-200 text-slate-700 leading-relaxed whitespace-pre-wrap">
                                                {c.message}
                                                
                                                {/* Attachments Display */}
                                                {c.attachments && c.attachments.length > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {c.attachments.map((att, idx) => (
                                                            <a 
                                                                key={idx} 
                                                                href={att.url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-brand/50 transition-all group/file"
                                                            >
                                                                <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover/file:text-brand">
                                                                    📄
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm font-bold text-slate-700 truncate">{att.name}</div>
                                                                    <div className="text-xs text-slate-400 uppercase">{att.name.split('.').pop()}</div>
                                                                </div>
                                                                <div className="text-slate-400">⬇</div>
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white border-t border-slate-100">
                            
                            {/* Pending Attachments */}
                            {pendingAttachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {pendingAttachments.map((att, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-xs font-bold border border-blue-100">
                                            <span>📎 {att.name}</span>
                                            <button 
                                                onClick={() => removePendingAttachment(idx)}
                                                className="hover:text-blue-900 w-4 h-4 flex items-center justify-center rounded-full hover:bg-blue-200"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <form onSubmit={handleSend} className="relative">
                                <textarea
                                    className="w-full pl-4 pr-12 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand focus:border-brand outline-none transition-all resize-none shadow-sm min-h-[80px]"
                                    placeholder="Type your message... (use @internal for team-only notes)"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend(e);
                                        }
                                    }}
                                />
                                
                                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        onChange={handleFileSelect}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        className={`p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100 ${uploading ? 'animate-pulse' : ''}`}
                                        title="Attach File"
                                    >
                                        {uploading ? '⌛' : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                        )}
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={sending || (!newMessage.trim() && pendingAttachments.length === 0)}
                                        className="bg-brand text-white p-2 rounded-lg shadow-md hover:bg-brand-dark transition-all disabled:opacity-50 disabled:shadow-none"
                                    >
                                        <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                    </button>
                                </div>
                            </form>
                            <div className="text-xs text-slate-400 mt-2 flex gap-4">
                                <span><b>Tip:</b> Start message with <code>@internal</code> to keep it private from client exports.</span>
                            </div>
                        </div>
                    </div>

                    {/* Context Sidebar */}
                    <div className="w-80 flex flex-col gap-6">
                        
                        {/* Project Context Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Project Context</h3>
                            <div className="space-y-4">
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Client</div>
                                    <div className="font-bold text-slate-800">{quotation?.client_name || 'Pending'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Total Value</div>
                                    <div className="font-mono font-bold text-brand text-lg">${quotation?.total_price?.toLocaleString() || '0.00'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Status</div>
                                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded uppercase border border-green-200">
                                        {quotation?.status}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity Mini-Feed */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex-1">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">System Events</h3>
                            <div className="space-y-4 relative">
                                {/* Vertical Line */}
                                <div className="absolute left-1.5 top-2 bottom-2 w-px bg-slate-100"></div>
                                
                                {/* Static mock events for visual structure */}
                                <div className="relative pl-6">
                                    <div className="absolute left-0 top-1.5 w-3 h-3 bg-brand rounded-full border-2 border-white ring-1 ring-slate-100"></div>
                                    <div className="text-xs font-bold text-slate-700">Page Viewed</div>
                                    <div className="text-[10px] text-slate-400">Just now</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}