"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getQuotation, getQuotationComments, addQuotationComment } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ProductImage } from "@/components/ProductImage";

// --- TYPES (Simplified for view) ---
type QuotationItem = { 
    product_title: string; 
    product_description?: string; 
    quantity: number; 
    price: number; 
    unit_price: number; 
    image_url?: string; 
};

type Comment = {
    id: number;
    user_name: string;
    message: string;
    is_internal: boolean;
    created_at: string;
    attachments?: any[];
};

export default function ClientViewPage() {
    const params = useParams();
    const rawId = params?.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const [data, setData] = useState<any>(null);
    const [items, setItems] = useState<QuotationItem[]>([]);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Comment Form State
    const [authorName, setAuthorName] = useState("");
    const [authorEmail, setAuthorEmail] = useState("");
    const [newMessage, setNewMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    async function loadData() {
        try {
            const [q, c] = await Promise.all([
                getQuotation(Number(id)),
                getQuotationComments(Number(id)).catch(() => [])
            ]);
            setData(q);
            // Filter out internal comments for the client view
            setComments((c || []).filter((x: Comment) => !x.is_internal));
            
            const mappedItems = (q.content?.matches || []).map((m: any) => {
                const unitPrice = m.unit_price || (m.price / (m.quantity || 1)) || m.price || 0;
                return {
                    product_title: m.product_title || "Product",
                    product_description: m.product_description,
                    quantity: m.quantity || 1,
                    unit_price: unitPrice,
                    price: m.price || (unitPrice * (m.quantity || 1)),
                    image_url: m.image_url || "",
                };
            });
            setItems(mappedItems);
        } catch (err) {
            console.error(err);
            setError("Quotation not found or access denied.");
        } finally {
            setLoading(false);
        }
    }

    const handlePostComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !authorName.trim()) return;

        setSubmitting(true);
        try {
            await addQuotationComment(Number(id), newMessage, false, [], authorName, authorEmail);
            setNewMessage("");
            // Refresh comments
            const freshComments = await getQuotationComments(Number(id));
            setComments(freshComments.filter((x: Comment) => !x.is_internal));
            alert("Comment posted successfully!");
        } catch (e) {
            alert("Failed to post comment.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex justify-center items-center"><LoadingSpinner size="lg" /></div>;
    if (error) return <div className="min-h-screen bg-slate-50 flex justify-center items-center text-slate-500">{error}</div>;
    if (!data) return null;

    const total = items.reduce((acc, item) => acc + item.price, 0);

    return (
        <div className="min-h-screen bg-white pb-20">
            {/* Simple Header */}
            <div className="bg-slate-900 text-white p-6 md:p-12">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Quotation #{data.id}</div>
                        <h1 className="text-3xl md:text-4xl font-bold mb-2">{data.rfp_title}</h1>
                        <p className="text-slate-300">Prepared for <span className="font-bold text-white">{data.client_name}</span></p>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-slate-400 mb-1">Total Amount</div>
                        <div className="text-3xl font-mono font-bold text-white">${total.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-2">Date: {new Date(data.created_at).toLocaleDateString()}</div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 py-12">
                
                {/* Introduction / Summary if available */}
                {data.content?.summary && (
                    <div className="mb-12 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                        <h3 className="font-bold text-slate-800 mb-2">Executive Summary</h3>
                        <p className="text-slate-600 leading-relaxed text-sm">{data.content.summary}</p>
                    </div>
                )}

                {/* Line Items Table */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-12">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">
                            <tr>
                                <th className="px-6 py-4">Product Detail</th>
                                <th className="px-6 py-4 text-center">Qty</th>
                                <th className="px-6 py-4 text-right">Unit Price</th>
                                <th className="px-6 py-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex gap-4">
                                            {item.image_url && (
                                                <div className="flex-none">
                                                    <ProductImage 
                                                        src={item.image_url} 
                                                        alt={item.product_title} 
                                                        className="w-16 h-16 object-cover rounded-lg bg-slate-100 border border-slate-100" 
                                                    />
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-bold text-slate-800 text-base">{item.product_title}</div>
                                                <div className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">{item.product_description}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center font-medium text-slate-600">
                                        {item.quantity}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-600">
                                        ${item.unit_price.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">
                                        ${item.price.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200">
                            <tr>
                                <td colSpan={3} className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase">Total</td>
                                <td className="px-6 py-4 text-right font-mono text-xl font-bold text-slate-900">${total.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* --- COMMENTS SECTION --- */}
                <div className="mt-16 border-t border-slate-200 pt-12">
                    <h2 className="text-2xl font-bold text-slate-800 mb-8">Discussion & Feedback</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        {/* List */}
                        <div className="space-y-6">
                            {comments.length === 0 ? (
                                <div className="text-slate-400 italic">No comments yet. Be the first to share your thoughts!</div>
                            ) : (
                                comments.map((c) => (
                                    <div key={c.id} className="flex gap-4">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm flex-none">
                                            {c.user_name ? c.user_name.substring(0, 2).toUpperCase() : "?"}
                                        </div>
                                        <div>
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <span className="font-bold text-slate-800">{c.user_name}</span>
                                                <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-slate-600 text-sm leading-relaxed bg-slate-50 p-3 rounded-lg rounded-tl-none border border-slate-100">
                                                {c.message}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Form */}
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 h-fit">
                            <h3 className="font-bold text-slate-800 mb-4">Leave a Comment</h3>
                            <form onSubmit={handlePostComment} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Your Name *</label>
                                        <input 
                                            required
                                            type="text" 
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:border-brand outline-none"
                                            value={authorName}
                                            onChange={(e) => setAuthorName(e.target.value)}
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email (Optional)</label>
                                        <input 
                                            type="email" 
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:border-brand outline-none"
                                            value={authorEmail}
                                            onChange={(e) => setAuthorEmail(e.target.value)}
                                            placeholder="john@example.com"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Message *</label>
                                    <textarea 
                                        required
                                        className="w-full p-3 border border-slate-300 rounded-lg focus:border-brand outline-none h-32 resize-none"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        placeholder="Enter your questions or feedback here..."
                                    />
                                </div>
                                <button 
                                    type="submit" 
                                    disabled={submitting}
                                    className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
                                >
                                    {submitting ? "Posting..." : "Post Comment"}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Footer / Contact */}
                <div className="text-center border-t border-slate-100 pt-12 mt-12">
                    <p className="text-slate-500 text-sm mb-4">Need direct assistance?</p>
                    <button 
                        onClick={() => window.location.href = `mailto:support@projectphoenix.com?subject=Question regarding Quotation #${data.id}`}
                        className="bg-white border border-slate-300 text-slate-600 px-6 py-2 rounded-xl font-bold hover:bg-slate-50 transition-all text-sm"
                    >
                        Email Support
                    </button>
                    <div className="mt-8 text-xs text-slate-400">
                        Generated by Project Phoenix • Valid for 30 days
                    </div>
                </div>
            </div>
        </div>
    );
}