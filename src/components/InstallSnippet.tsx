"use client";

import { useState } from "react";

export function InstallSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the code is still there to select by hand.
    }
  };

  return (
    <div className="stack">
      <p className="muted">
        Paste this line just before <code>&lt;/body&gt;</code> on every page where the chat button
        should appear. In WordPress, a “header and footer scripts” plugin does this without editing
        the theme.
      </p>
      <pre className="snippet">
        <code>{snippet}</code>
      </pre>
      <div className="button-row">
        <button type="button" className="button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
    </div>
  );
}
