"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: "0 0 8px" }}>{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ margin: "0 0 8px", paddingLeft: 18 }}>{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li style={{ margin: "2px 0" }}>{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <div style={{ fontSize: 15, fontWeight: 800, margin: "0 0 6px" }}>{children}</div>,
  h2: ({ children }: { children?: React.ReactNode }) => <div style={{ fontSize: 14.5, fontWeight: 800, margin: "0 0 6px" }}>{children}</div>,
  h3: ({ children }: { children?: React.ReactNode }) => <div style={{ fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>{children}</div>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 800 }}>{children}</strong>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: "#2f6fb0", textDecoration: "underline" }}>
      {children}
    </a>
  ),
};

export default function MarkdownText({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.5, ...style }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
