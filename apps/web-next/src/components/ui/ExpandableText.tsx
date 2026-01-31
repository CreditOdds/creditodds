"use client";

import { useState } from "react";

interface ExpandableTextProps {
  text: string;
  className?: string;
}

export function ExpandableText({ text, className = "" }: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={className}>
      <span className={isExpanded ? "" : "line-clamp-2"}>
        {text}
      </span>
      {text.length > 120 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-indigo-600 hover:text-indigo-800 text-sm ml-1"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
