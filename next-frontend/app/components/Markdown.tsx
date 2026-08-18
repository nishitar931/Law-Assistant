"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
// highlight.js styles are optional; you can keep your theme clean.
// If you want the default look, uncomment the next line and add the CSS:
// import "highlight.js/styles/github-dark.min.css";

type Props = {
  children: string;
  className?: string;
};

/**
 * Safe markdown renderer:
 * - GitHub-flavored markdown (tables, task lists, strikethrough)
 * - Code block syntax highlighting (no custom colors, inherits theme)
 * - HTML in markdown is ignored by default (safer)
 */
export default function Markdown({ children, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        // SECURITY: by default, ReactMarkdown does NOT render raw HTML (safe)
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ node, ...props }) => <h1 className="mt-2 mb-3 font-extrabold text-xl" {...props} />,
          h2: ({ node, ...props }) => <h2 className="mt-2 mb-2 font-bold text-lg" {...props} />,
          h3: ({ node, ...props }) => <h3 className="mt-2 mb-2 font-semibold" {...props} />,
          p:  ({ node, ...props }) => <p className="mb-3 leading-relaxed" {...props} />,
          ul: ({ node, ...props }) => <ul className="mb-3 list-disc list-inside space-y-1" {...props} />,
          ol: ({ node, ...props }) => <ol className="mb-3 list-decimal list-inside space-y-1" {...props} />,
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          code: ({ node, inline, className, children, ...props }) => {
            const isBlock = !inline;
            return isBlock ? (
              <pre className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3 overflow-x-auto text-sm">
                <code className={className} {...props}>{children}</code>
              </pre>
            ) : (
              <code className="px-1 py-0.5 rounded bg-[color:var(--color-soft)] border border-[color:var(--color-border)] text-[.95em]" {...props}>
                {children}
              </code>
            );
          },
          a: ({ node, ...props }) => (
            <a
              {...props}
              className="underline underline-offset-4 hover:opacity-90"
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
          table: ({ node, ...props }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-[color:var(--color-border)] bg-[color:var(--color-soft)] px-2 py-1 text-left" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-[color:var(--color-border)] px-2 py-1 align-top" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 pl-3 my-2 border-[color:var(--color-border)] text-[color:var(--color-muted)]" {...props} />
          ),
          hr: () => <hr className="my-4 border-[color:var(--color-border)]" />
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
