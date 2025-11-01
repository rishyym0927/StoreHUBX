import { Component } from "@/types";
import { formatDate } from "@/lib/api-utils";

interface ComponentMetadataProps {
  component: Component;
  versionsCount?: number;
}

export function ComponentMetadata({ component, versionsCount = 0 }: ComponentMetadataProps) {
  const createdDate = component.createdAt ? formatDate(component.createdAt) : "—";
  const updatedDate = component.updatedAt ? formatDate(component.updatedAt) : "—";
  const isLinked = component.repoLink && component.repoLink.owner && component.repoLink.repo;

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="pb-4 border-b border-black dark:border-white">
        <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-3 uppercase tracking-wider">
          Quick Stats
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 border border-black dark:border-white bg-black/5 dark:bg-white/5">
            <div className="text-2xl font-bold font-mono">{versionsCount}</div>
            <div className="text-xs font-mono text-black/60 dark:text-white/60 mt-1">
              Version{versionsCount !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="text-center p-3 border border-black dark:border-white bg-black/5 dark:bg-white/5">
            <div className="text-2xl font-bold font-mono">
              {component.frameworks?.length || 0}
            </div>
            <div className="text-xs font-mono text-black/60 dark:text-white/60 mt-1">
              Framework{component.frameworks?.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Framework Badges */}
      {component.frameworks && component.frameworks.length > 0 && (
        <div className="pb-4 border-b border-black dark:border-white">
          <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-2 uppercase tracking-wider">
            Frameworks
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {component.frameworks.map((fw) => (
              <span
                key={fw}
                className="px-2 py-1 border border-black dark:border-white text-xs font-mono bg-white dark:bg-black"
              >
                {fw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {component.tags && component.tags.length > 0 && (
        <div className="pb-4 border-b border-black dark:border-white">
          <div className="text-xs font-mono text-black/60 dark:text-white/60 mb-2 uppercase tracking-wider">
            Tags
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {component.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-black text-white dark:bg-white dark:text-black text-xs font-mono"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Metadata Details */}
      <div className="space-y-3 pb-4 border-b border-black dark:border-white">
        <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider">
          Details
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-black/60 dark:text-white/60">License</span>
          <span className="font-mono font-bold">{component.license || "None"}</span>
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-black/60 dark:text-white/60">Status</span>
          {isLinked ? (
            <span className="font-mono font-bold text-green-600 dark:text-green-400">
              ✓ Linked
            </span>
          ) : (
            <span className="font-mono font-bold text-red-600 dark:text-red-400">
              Not Linked
            </span>
          )}
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-black/60 dark:text-white/60">Created</span>
          <span className="font-mono font-bold">{createdDate}</span>
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-black/60 dark:text-white/60">Updated</span>
          <span className="font-mono font-bold">{updatedDate}</span>
        </div>
      </div>

      {/* Component ID */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-black/60 dark:text-white/60 uppercase tracking-wider">
          Component ID
        </div>
        <div className="font-mono text-xs break-all bg-black/5 dark:bg-white/5 p-2 rounded border border-black/10 dark:border-white/10">
          {component.slug}
        </div>
      </div>
    </div>
  );
}
