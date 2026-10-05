import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ children, href }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
  img: ({ alt }) => <span className="text-meta">{alt || "Image"}</span>,
  table: ({ children }) => <div className="markdown-table" tabIndex={0} role="region" aria-label="Response table"><table>{children}</table></div>,
  pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
};
const remarkPlugins = [remarkGfm];

/** Render streamed model text as safe Markdown, without executing model-authored HTML. */
export const MarkdownResponse = memo(function MarkdownResponse({ content }: { content: string }) {
  return (
    <div className="markdown-response">
      <Markdown
        remarkPlugins={remarkPlugins}
        skipHtml
        components={components}
      >{content}</Markdown>
    </div>
  );
});
