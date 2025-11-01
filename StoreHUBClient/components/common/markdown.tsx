"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content?: string | null }) {
  if (!content) {
    return (
      <div className="p-4 border border-black dark:border-white">
        <p className="font-mono text-sm text-black/60 dark:text-white/60">
          Nothing to show
        </p>
      </div>
    );
  }

  return (
    <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-black prose-a:underline dark:prose-a:text-white prose-code:font-mono prose-code:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  );
}
