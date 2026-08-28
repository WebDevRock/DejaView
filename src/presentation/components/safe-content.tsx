import type { ReactNode } from "react";
import type { SafeContentNode } from "../../domain/sources/provider";

export function SafeContent({ nodes }: { nodes: readonly SafeContentNode[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <SafeNode key={index} node={node} />
      ))}
    </>
  );
}
function children(nodes: SafeContentNode[]): ReactNode {
  return nodes.map((node, index) => <SafeNode key={index} node={node} />);
}
function SafeNode({ node }: { node: SafeContentNode }) {
  switch (node.type) {
    case "text":
      return node.href ? (
        <a
          className="text-emerald-700 underline"
          href={node.href}
          rel="noreferrer noopener"
          target="_blank"
        >
          {node.text}
        </a>
      ) : (
        <>{node.text}</>
      );
    case "paragraph":
      return <p className="my-3">{children(node.children)}</p>;
    case "heading": {
      const Tag = `h${node.level}` as "h1";
      return (
        <Tag className="my-3 font-semibold">{children(node.children)}</Tag>
      );
    }
    case "bulletList":
      return <ul className="my-3 list-disc pl-6">{children(node.children)}</ul>;
    case "orderedList":
      return (
        <ol className="my-3 list-decimal pl-6">{children(node.children)}</ol>
      );
    case "listItem":
      return <li>{children(node.children)}</li>;
    case "codeBlock":
      return (
        <pre className="my-3 overflow-auto rounded bg-slate-950 p-4 text-slate-100">
          <code>{node.text}</code>
        </pre>
      );
    case "hardBreak":
      return <br />;
  }
}
