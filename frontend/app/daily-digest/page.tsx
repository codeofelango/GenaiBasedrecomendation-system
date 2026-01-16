"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { AuthGuard } from "@/components/AuthGuard";
import { getDailySummary, getDailyPosts, createDailyPost, createDailyComment } from "@/lib/api";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function DailyDigestPage() {
    const [summary, setSummary] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPost, setNewPost] = useState("");
    const [commentInputs, setCommentInputs] = useState<{[key: number]: string}>({});
    const [activeTab, setActiveTab] = useState<"overview" | "community">("overview");

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            const [sumData, postsData] = await Promise.all([
                getDailySummary(),
                getDailyPosts()
            ]);
            setSummary(sumData);
            setPosts(postsData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const handlePostSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPost.trim()) return;
        try {
            await createDailyPost(newPost);
            setNewPost("");
            const freshPosts = await getDailyPosts();
            setPosts(freshPosts);
        } catch (e) {
            alert("Failed to post");
        }
    };

    const handleCommentSubmit = async (postId: number) => {
        const content = commentInputs[postId];
        if (!content?.trim()) return;
        try {
            await createDailyComment(postId, content);
            setCommentInputs(prev => ({...prev, [postId]: ""}));
            const freshPosts = await getDailyPosts();
            setPosts(freshPosts);
        } catch (e) {
            alert("Failed to comment");
        }
    };

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: 'Daily Quotation Digest',
                text: summary?.ai_summary || 'Check out today\'s metrics',
                url: window.location.href,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert("Link copied!");
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex justify-center py-20"><LoadingSpinner size="lg" /></div>;

    const m = summary?.metrics?.current_year || {};
    const lastM = summary?.metrics?.last_year || {};

    return (
        <AuthGuard>
            <div className="min-h-screen bg-slate-50 pb-20">
                <Navbar />
                
                <div className="bg-slate-900 text-white p-8">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-3xl font-bold mb-2">Daily Executive Digest</h1>
                                <p className="text-slate-400">AI-Powered Insights & Team Collaboration</p>
                            </div>
                            <button onClick={handleShare} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2">
                                <span>🔗</span> Share Report
                            </button>
                        </div>
                        
                        {/* AI Summary Card */}
                        <div className="mt-8 bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-white/10 p-6 rounded-2xl backdrop-blur-sm">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-white/10 rounded-xl text-2xl">🤖</div>
                                <div>
                                    <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider mb-2">Agent Insight</h3>
                                    <p className="text-lg leading-relaxed text-slate-100 font-light">
                                        {summary?.ai_summary || "Analyzing market data..."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-6 -mt-8">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <MetricCard title="Total Pipeline (YTD)" value={`$${(m.total || 0).toLocaleString()}`} trend={m.total > lastM.total ? "up" : "down"} />
                        <MetricCard title="Conversion Rate" value={`${(m.conv_rate || 0).toFixed(1)}%`} sub={`vs ${(lastM.conv_rate || 0).toFixed(1)}% LY`} trend={m.conv_rate > lastM.conv_rate ? "up" : "down"} />
                        <MetricCard title="Won Deals" value={m.won || 0} sub="Finalized Quotations" trend="neutral" />
                        <MetricCard title="Missed Opps" value={m.lost || 0} sub="Lost/Rejected" color="red" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left: Quarterly Breakdown */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-6">Quarterly Performance Comparison</h3>
                                <div className="space-y-6">
                                    {['q1', 'q2', 'q3', 'q4'].map((q) => (
                                        <div key={q} className="relative">
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="font-bold text-slate-600 uppercase">{q}</span>
                                                <div className="flex gap-4">
                                                    <span className="text-slate-500 text-xs">LY: ${lastM[q]?.toLocaleString()}</span>
                                                    <span className="text-slate-800 font-bold text-xs">CY: ${m[q]?.toLocaleString()}</span>
                                                </div>
                                            </div>
                                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                                                {/* Simple proportional bar logic, assuming max feasible is sort of arbitrary or sum of both for viz */}
                                                <div className="h-full bg-slate-300" style={{ width: `${(lastM[q] / (m[q] + lastM[q] || 1)) * 100}%` }}></div>
                                                <div className="h-full bg-brand" style={{ width: `${(m[q] / (m[q] + lastM[q] || 1)) * 100}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6 flex justify-center gap-6 text-xs text-slate-500">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-300 rounded-full"></div> Last Year</div>
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-brand rounded-full"></div> Current Year</div>
                                </div>
                            </div>

                            {/* Community Feed */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                    <span>💬</span> Team Discussion
                                </h3>
                                
                                {/* New Post Input */}
                                <form onSubmit={handlePostSubmit} className="mb-8">
                                    <textarea 
                                        className="w-full p-4 border border-slate-200 rounded-xl focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none bg-slate-50"
                                        placeholder="Share an update, strategy, or question..."
                                        rows={3}
                                        value={newPost}
                                        onChange={(e) => setNewPost(e.target.value)}
                                    />
                                    <div className="flex justify-end mt-2">
                                        <button type="submit" className="bg-slate-900 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 transition-all">Post Update</button>
                                    </div>
                                </form>

                                {/* Feed */}
                                <div className="space-y-6">
                                    {posts.map((post) => (
                                        <div key={post.id} className="border-b border-slate-100 last:border-0 pb-6 last:pb-0">
                                            <div className="flex gap-3 mb-2">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                                                    {post.user_name?.substring(0,2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-sm">{post.user_name}</div>
                                                    <div className="text-xs text-slate-400">{new Date(post.created_at).toLocaleString()}</div>
                                                </div>
                                            </div>
                                            <p className="text-slate-600 text-sm mb-4 pl-11">{post.content}</p>
                                            
                                            {/* Comments */}
                                            <div className="pl-11 space-y-3">
                                                {post.comments?.map((c: any) => (
                                                    <div key={c.id} className="bg-slate-50 p-3 rounded-lg text-xs">
                                                        <span className="font-bold text-slate-700 mr-2">{c.user_name}:</span>
                                                        <span className="text-slate-600">{c.content}</span>
                                                    </div>
                                                ))}
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:border-brand outline-none"
                                                        placeholder="Write a comment..."
                                                        value={commentInputs[post.id] || ""}
                                                        onChange={(e) => setCommentInputs({...commentInputs, [post.id]: e.target.value})}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(post.id)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right: Strategy & Actions */}
                        <div className="space-y-6">
                            <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl">
                                <h3 className="font-bold text-orange-800 mb-2">⚠️ Missing Opportunities</h3>
                                <p className="text-sm text-orange-700 mb-4">You have {m.lost} rejected quotations this year. Common reasons:</p>
                                <ul className="list-disc list-inside text-xs text-orange-700 space-y-1">
                                    <li>Price too high vs competitor</li>
                                    <li>Delivery timeline mismatch</li>
                                    <li>Spec mismatch</li>
                                </ul>
                                <button className="mt-4 w-full bg-white border border-orange-200 text-orange-700 py-2 rounded-lg text-xs font-bold hover:bg-orange-100 transition-all">
                                    Review Lost Deals
                                </button>
                            </div>

                            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                                <h3 className="font-bold text-slate-800 mb-4">Quick Actions</h3>
                                <div className="space-y-2">
                                    <button className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-brand/10 hover:text-brand rounded-xl text-sm font-medium transition-all flex justify-between group">
                                        <span>Download Q{Math.ceil((new Date().getMonth()+1)/3)} Report</span>
                                        <span className="text-slate-400 group-hover:text-brand">⬇</span>
                                    </button>
                                    <button className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-brand/10 hover:text-brand rounded-xl text-sm font-medium transition-all flex justify-between group">
                                        <span>Schedule Review Meeting</span>
                                        <span className="text-slate-400 group-hover:text-brand">📅</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}

const MetricCard = ({ title, value, sub, trend, color }: any) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
        <div className="text-xs text-slate-500 uppercase font-bold mb-1">{title}</div>
        <div className={`text-2xl font-bold ${color === 'red' ? 'text-red-500' : 'text-slate-800'}`}>{value}</div>
        {(sub || trend) && (
            <div className="flex items-center gap-2 mt-2">
                {trend && (
                    <span className={`text-xs font-bold ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                        {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '−'}
                    </span>
                )}
                {sub && <span className="text-xs text-slate-400">{sub}</span>}
            </div>
        )}
    </div>
);