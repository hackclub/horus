import type React from "react";
import { cn } from "@/lib/utils";

// Renders Slack mrkdwn as React nodes: links, mentions, code, bold, italic,
// strike. Never touches innerHTML, and only http(s)/mailto links become <a>.

const INLINE =
  /(<[^<>\n]+>)|(`[^`\n]+`)|((?<![\w*])\*[^*\n]+\*(?![\w*]))|((?<![\w_])_[^_\n]+_(?![\w_]))|((?<![\w~])~[^~\n]+~(?![\w~]))/g;

function decodeEntities(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeHref(target: string): string | null {
  try {
    const url = new URL(target);
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function renderAngle(token: string, key: string): React.ReactNode {
  const inner = token.slice(1, -1);
  const [target, label] = inner.split("|", 2);

  if (target.startsWith("@")) {
    return (
      <span key={key} className="text-primary font-medium">
        @{label || target.slice(1)}
      </span>
    );
  }
  if (target.startsWith("#")) {
    return (
      <span key={key} className="text-primary font-medium">
        #{label || target.slice(1)}
      </span>
    );
  }
  if (target.startsWith("!")) {
    return (
      <span key={key} className="font-medium">
        @{label || target.slice(1).split("^")[0]}
      </span>
    );
  }

  const href = safeHref(decodeEntities(target));
  const text = decodeEntities(label || target);
  if (!href) return <span key={key}>{text}</span>;
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline break-all"
    >
      {text}
    </a>
  );
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let index = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(decodeEntities(text.slice(last, start)));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (match[1]) {
      nodes.push(renderAngle(token, key));
    } else if (match[2]) {
      nodes.push(
        <code key={key} className="font-mono bg-muted px-1">
          {decodeEntities(token.slice(1, -1))}
        </code>,
      );
    } else {
      const inner = renderInline(token.slice(1, -1), key);
      if (match[3]) nodes.push(<strong key={key}>{inner}</strong>);
      else if (match[4]) nodes.push(<em key={key}>{inner}</em>);
      else nodes.push(<s key={key}>{inner}</s>);
    }
    last = start + token.length;
  }

  if (last < text.length) nodes.push(decodeEntities(text.slice(last)));
  return nodes;
}

export function SlackText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  // Odd segments are inside ``` fences.
  const segments = text.split("```");

  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, i) =>
        i % 2 === 1 ? (
          <pre
            // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder
            key={i}
            className="font-mono bg-muted p-2 my-1 overflow-x-auto whitespace-pre"
          >
            {decodeEntities(segment.replace(/^\n/, ""))}
          </pre>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder
          <span key={i}>{renderInline(segment, `s${i}`)}</span>
        ),
      )}
    </div>
  );
}
