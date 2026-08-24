import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MessageMarkdown({
  children,
  compact = false,
}: {
  children: string;
  compact?: boolean;
}) {
  const spacing = compact ? "space-y-1.5" : "space-y-2";

  return (
    <div className={`min-w-0 max-w-full overflow-x-auto break-words ${spacing}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: content }) => <h1 className="text-lg font-semibold">{content}</h1>,
          h2: ({ children: content }) => <h2 className="text-base font-semibold">{content}</h2>,
          h3: ({ children: content }) => <h3 className="text-sm font-semibold">{content}</h3>,
          p: ({ children: content }) => <p className="whitespace-pre-wrap leading-relaxed">{content}</p>,
          ul: ({ children: content }) => <ul className="list-disc space-y-1 pl-5">{content}</ul>,
          ol: ({ children: content }) => <ol className="list-decimal space-y-1 pl-5">{content}</ol>,
          li: ({ children: content }) => <li className="pl-0.5">{content}</li>,
          strong: ({ children: content }) => <strong className="font-semibold">{content}</strong>,
          blockquote: ({ children: content }) => (
            <blockquote className="border-l-2 border-neutral-500 pl-3 opacity-90">{content}</blockquote>
          ),
          hr: () => <hr className="border-neutral-600" />,
          table: ({ children: content }) => (
            <table className="w-full min-w-max border-collapse text-left text-xs">{content}</table>
          ),
          th: ({ children: content }) => (
            <th className="border border-neutral-600 bg-black/10 px-2 py-1.5 font-semibold">{content}</th>
          ),
          td: ({ children: content }) => (
            <td className="border border-neutral-600 px-2 py-1.5 align-top">{content}</td>
          ),
          pre: ({ children: content }) => (
            <pre className="overflow-x-auto rounded bg-black/30 p-3 text-xs leading-relaxed">{content}</pre>
          ),
          code: ({ children: content, className }) => className ? (
            <code className={className}>{content}</code>
          ) : (
            <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-[0.9em]">{content}</code>
          ),
          a: ({ children: content, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {content}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
