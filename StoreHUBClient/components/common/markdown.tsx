"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content?: string | null }) {
  if (!content) {
    return (
      <div className="p-4 border rounded-xl opacity-70">
        Nothing to show.
      </div>
    );
  }

  return (
    <article className="prose dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  );
}
