"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/store";
import { commentApi } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { useToast } from "@/components/common/toast";
import type { Comment } from "@/types";
import Link from "next/link";
import Image from "next/image";
import { MessageSquare } from "lucide-react";

interface CommentsProps {
  slug: string;
}

export function ComponentComments({ slug }: CommentsProps) {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [slug]);

  const fetchComments = async () => {
    try {
      const data = await commentApi.list(slug);
      setComments(data || []);
    } catch (error) {
      console.error("Failed to load comments:", error);
      showToast("Failed to load comments.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user || !newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const added = await commentApi.create(slug, newComment, token);
      setComments([added, ...comments]);
      setNewComment("");
    } catch (error) {
      console.error("Failed to post comment:", error);
      showToast("Failed to post comment. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!token) return;
    try {
      await commentApi.delete(slug, commentId, token);
      setComments(comments.filter(c => c.id !== commentId));
    } catch (error) {
      console.error("Failed to delete comment:", error);
      showToast("Failed to delete comment. Please try again.", "error");
    }
  };

  return (
    <div className="mt-12 border-t-4 border-black dark:border-white pt-8">
      <h2 className="text-2xl font-black uppercase tracking-tight mb-8">
        Discussions ({comments.length})
      </h2>

      {/* Post Box */}
      {user ? (
        <form onSubmit={handleSubmit} className="mb-10">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="What do you think about this component?"
            className="w-full min-h-[100px] p-4 font-mono text-sm border-2 border-black dark:border-white bg-transparent focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-y"
            disabled={isSubmitting}
          />
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={isSubmitting || !newComment.trim()}
              className="px-6 py-2 bg-black text-white dark:bg-white dark:text-black font-mono font-bold uppercase text-sm border-2 border-black dark:border-white hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isSubmitting ? "Posting..." : "Post Comment"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-10 p-6 border-2 border-black dark:border-white bg-black/5 dark:bg-white/5 text-center font-mono text-sm">
          You must be logged in to leave a comment.
        </div>
      )}

      {/* Comments List */}
      {isLoading ? (
        <div className="font-mono text-sm animate-pulse">Loading comments...</div>
      ) : comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No Comments Yet" description="Be the first to start the discussion." />
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="p-4 border-2 border-black dark:border-white bg-white dark:bg-black">
              <div className="flex justify-between items-start mb-3">
                <Link
                  href={`/users/${comment.userId}`}
                  className="flex items-center gap-2 hover:underline group"
                >
                  {comment.authorAvatar ? (
                    <Image
                      src={comment.authorAvatar}
                      alt={comment.authorUsername || "User"}
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded-full border border-black dark:border-white group-hover:scale-110 transition-transform"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs uppercase">
                      {(comment.authorUsername || comment.authorName || comment.userId).charAt(0)}
                    </div>
                  )}
                  <span className="font-bold font-mono text-sm">
                    {comment.authorName || comment.authorUsername || comment.userId}
                  </span>
                </Link>
                <span className="font-mono text-xs text-black/50 dark:text-white/50">
                  {new Date(comment.createdAt).toLocaleDateString()} at {new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
              <p className="font-mono text-sm whitespace-pre-wrap">{comment.content}</p>

              {/* Delete button if owner */}
              {user?.providerId === comment.userId && (
                <div className="mt-3 text-right">
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-xs font-mono font-bold text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
