"use client";

import { componentApi } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { useToast } from "@/components/common/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirmDelete } from "@/hooks/use-confirm-delete";
import { Lock, Trash2 } from "lucide-react";

interface OwnerActionsProps {
  ownerId: string;
  componentSlug: string;
  isLinked: boolean;
  visibility?: "public" | "private";
  collaborators?: string[];
}

export function OwnerActions({
  ownerId,
  componentSlug,
  isLinked,
  visibility: initialVisibility = "public",
  collaborators: initialCollaborators = [],
}: OwnerActionsProps) {
  const { token, user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const isOwner = !!(user && token && user.id === ownerId);

  const [visibility, setVisibility] = useState(initialVisibility);
  const [collaborators, setCollaborators] = useState(initialCollaborators);
  const [newCollaborator, setNewCollaborator] = useState("");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { confirming: confirmingDelete, pending: deleting, trigger: handleDelete } = useConfirmDelete(async () => {
    if (!token) return;
    setError(null);
    try {
      await componentApi.delete(componentSlug, token);
      showToast("Component deleted.", "success");
      router.push("/me");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete component");
    }
  });

  if (!isOwner) {
    return (
      <div className="text-center py-6">
        <p className="text-sm font-mono text-black/60 dark:text-white/60 flex items-center justify-center gap-1.5">
          <Lock className="w-4 h-4" /> Only the component owner can manage this component
        </p>
      </div>
    );
  }

  const toggleVisibility = async () => {
    if (!token) return;
    const next = visibility === "public" ? "private" : "public";
    setUpdating(true);
    setError(null);
    try {
      await componentApi.updateVisibility(componentSlug, next, token);
      setVisibility(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update visibility");
    } finally {
      setUpdating(false);
    }
  };

  const addCollaborator = async () => {
    if (!token || !newCollaborator.trim()) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await componentApi.addCollaborator(componentSlug, newCollaborator.trim(), token);
      setCollaborators(updated.collaborators || []);
      setNewCollaborator("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add collaborator");
    } finally {
      setUpdating(false);
    }
  };

  const removeCollaborator = async (userId: string) => {
    if (!token) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await componentApi.removeCollaborator(componentSlug, userId, token);
      setCollaborators(updated.collaborators || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove collaborator");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-3">
      <Link
        href={`/components/${componentSlug}/import`}
        className="block w-full text-center border-2 border-black dark:border-white px-4 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95"
      >
        {isLinked ? "Change Repository" : "Link GitHub"}
      </Link>

      {isLinked && (
        <Link
          href={`/components/${componentSlug}/new-version`}
          className="block w-full text-center border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-4 py-3 text-sm font-mono transition-transform hover:scale-105 active:scale-95"
        >
          Add New Version
        </Link>
      )}

      <div className="border-2 border-black dark:border-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-mono font-bold uppercase">Visibility</span>
          <button
            onClick={toggleVisibility}
            disabled={updating}
            className="px-3 py-1.5 border-2 border-black dark:border-white text-xs font-mono font-bold uppercase transition-colors hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black disabled:opacity-50"
          >
            {visibility === "private" ? "Private" : "Public"}
          </button>
        </div>

        {visibility === "private" && (
          <div className="space-y-2 pt-3 border-t border-black/20 dark:border-white/20">
            <span className="text-xs font-mono font-bold uppercase block">Collaborators</span>
            {collaborators.length > 0 && (
              <ul className="space-y-1">
                {collaborators.map((cid) => (
                  <li key={cid} className="flex items-center justify-between text-xs font-mono">
                    <span className="truncate">{cid}</span>
                    <button
                      onClick={() => removeCollaborator(cid)}
                      disabled={updating}
                      className="text-red-600 dark:text-red-400 font-bold hover:underline shrink-0 ml-2"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                value={newCollaborator}
                onChange={(e) => setNewCollaborator(e.target.value)}
                placeholder="GitHub provider ID"
                className="flex-1 min-w-0 px-2 py-1.5 border-2 border-black dark:border-white bg-transparent text-xs font-mono"
              />
              <button
                onClick={addCollaborator}
                disabled={updating || !newCollaborator.trim()}
                className="px-3 py-1.5 border-2 border-black dark:border-white text-xs font-mono font-bold uppercase disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs font-mono text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="border-2 border-red-600 dark:border-red-400 p-4 space-y-2">
        <span className="text-xs font-mono font-bold uppercase text-red-600 dark:text-red-400">Danger Zone</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`w-full flex items-center justify-center gap-2 border-2 px-4 py-3 text-sm font-mono font-bold uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            confirmingDelete
              ? "border-red-600 dark:border-red-400 bg-red-600 dark:bg-red-500 text-white"
              : "border-red-600 dark:border-red-400 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white dark:hover:bg-red-500 dark:hover:text-white"
          }`}
        >
          <Trash2 className="w-4 h-4" />
          {deleting ? "Deleting..." : confirmingDelete ? "Click again to confirm" : "Delete Component"}
        </button>
        {confirmingDelete && !deleting && (
          <p className="text-xs font-mono text-red-600 dark:text-red-400">
            This permanently deletes the component, its versions, builds, likes, ratings and comments. This can&apos;t be undone.
          </p>
        )}
      </div>
    </div>
  );
}
