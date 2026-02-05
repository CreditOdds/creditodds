"use client";

import { useState, useEffect } from "react";
import { ListBulletIcon } from "@heroicons/react/24/outline";

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
}

function extractHeadings(content: string): TOCItem[] {
  const headings: TOCItem[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    const h3Match = line.match(/^### (.+)$/);

    if (h2Match) {
      const text = h2Match[1].trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      headings.push({ id, text, level: 2 });
    } else if (h3Match) {
      const text = h3Match[1].trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      headings.push({ id, text, level: 3 });
    }
  }

  return headings;
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const [isExpanded, setIsExpanded] = useState(true);
  const headings = extractHeadings(content);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-80px 0px -80% 0px" }
    );

    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav className="bg-gray-50 rounded-lg p-4 mb-8 border border-gray-200">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left font-semibold text-gray-900"
      >
        <ListBulletIcon className="h-5 w-5 text-gray-500" />
        <span>Table of Contents</span>
        <svg
          className={`ml-auto h-5 w-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <ul className="mt-3 space-y-1">
          {headings.map((heading) => (
            <li
              key={heading.id}
              className={heading.level === 3 ? "ml-4" : ""}
            >
              <a
                href={`#${heading.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`block py-1 text-sm transition-colors ${
                  activeId === heading.id
                    ? "text-indigo-600 font-medium"
                    : "text-gray-600 hover:text-indigo-600"
                }`}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
