import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getUserTweets, createTweet, updateTweet, deleteTweet } from "../api/tweet.api";
import { toggleTweetLike } from "../api/like.api";
import { formatTimeAgo } from "../utils/formatters";
import { MessageCircle, Send, Edit2, Trash2, ThumbsUp, MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";

function Tweets() {
  const { user } = useSelector((state) => state.auth);
  const [tweets, setTweets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    if (user?._id) loadTweets();
  }, [user]);

  const loadTweets = async () => {
    try {
      setLoading(true);
      const res = await getUserTweets(user._id);
      setTweets(res.data.data || []);
    } catch {
      // silenced
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await createTweet(content);
      setContent("");
      loadTweets();
      toast.success("Tweet posted!");
    } catch {
      toast.error("Failed to post tweet");
    }
  };

  const handleUpdate = async (tweetId) => {
    if (!editContent.trim()) return;
    try {
      await updateTweet(tweetId, editContent);
      setEditingId(null);
      setEditContent("");
      loadTweets();
      toast.success("Tweet updated!");
    } catch {
      toast.error("Failed to update tweet");
    }
  };

  const handleDelete = async (tweetId) => {
    if (!confirm("Delete this tweet?")) return;
    try {
      await deleteTweet(tweetId);
      loadTweets();
      toast.success("Tweet deleted!");
    } catch {
      toast.error("Failed to delete tweet");
    }
  };

  const handleLike = async (tweetId) => {
    try {
      await toggleTweetLike(tweetId);
      toast.success("Toggled like!");
    } catch {
      toast.error("Failed to like tweet");
    }
  };

  return (
    <div className="p-6 md:p-12 max-w-3xl mx-auto bg-white min-h-screen">
      <div className="mb-12">
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter flex items-center gap-4">
          <MessageCircle size={36} className="text-blue-600" />
          Community Posts
        </h1>
        <p className="text-slate-500 text-sm mt-2 font-medium">Share your thoughts with the community</p>
      </div>

      {/* Create Tweet */}
      <form onSubmit={handleCreate} className="mb-12">
        <div className="flex gap-4">
          <img src={user?.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-slate-100 shadow-sm flex-shrink-0" alt="Avatar" />
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all resize-none"
            />
            <div className="flex justify-end mt-3">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex items-center gap-2"
              >
                <Send size={14} /> Post
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Tweets List */}
      <div className="space-y-6">
        {tweets.map((tweet) => (
          <div key={tweet._id} className="bg-white border border-slate-100 rounded-3xl p-6 hover:shadow-lg hover:shadow-blue-900/5 transition-all group">
            <div className="flex gap-4">
              <img src={tweet.owner?.avatar || user?.avatar} className="w-11 h-11 rounded-full object-cover border border-slate-100 shadow-sm flex-shrink-0" alt="Avatar" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-900 text-sm font-black">@{tweet.owner?.username || user?.username}</span>
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{formatTimeAgo(tweet.createdAt)}</span>
                  </div>
                  {(tweet.owner?._id === user?._id || !tweet.owner) && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingId(tweet._id); setEditContent(tweet.content); }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(tweet._id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {editingId === tweet._id ? (
                  <div className="mt-3">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => handleUpdate(tweet._id)} className="bg-blue-600 text-white px-5 py-1.5 rounded-full text-xs font-black transition-all">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-slate-500 px-5 py-1.5 rounded-full text-xs font-black hover:bg-slate-50 transition-all">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-700 text-sm leading-relaxed mt-2 font-medium">{tweet.content}</p>
                )}

                <div className="flex items-center gap-5 mt-4">
                  <button
                    onClick={() => handleLike(tweet._id)}
                    className="text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-2 text-xs font-bold"
                  >
                    <ThumbsUp size={14} /> Like
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {tweets.length === 0 && !loading && (
          <div className="text-center py-20 opacity-30 border-2 border-dashed border-slate-100 rounded-3xl">
            <MessageCircle size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-900 font-black uppercase tracking-tighter italic">No posts yet</p>
            <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">Share something with your audience</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Tweets;
