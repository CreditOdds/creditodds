"use client";

import { useMemo } from "react";

interface ArticleContentProps {
  content: string;
}

// Simple markdown to HTML converter for article content
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" class="text-indigo-600 hover:text-indigo-800 underline">$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gim, '<hr class="my-8 border-gray-200" />');

  // Unordered lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');

  // Ordered lists (numbered)
  html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>');

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/(<li>.*<\/li>\n?)+/gi, (match) => {
    return `<ul class="list-disc pl-6 my-4 space-y-1">${match}</ul>`;
  });

  // Tables (basic support)
  html = html.replace(/^\|(.+)\|$/gim, (match, content) => {
    if (content.includes('---')) {
      return ''; // Skip separator row
    }
    const cells = content.split('|').map((cell: string) => cell.trim());
    const isHeader = match.includes('---') === false && html.indexOf(match) === html.indexOf('|');
    const cellTag = 'td';
    const cellsHtml = cells.map((cell: string) => `<${cellTag} class="border border-gray-200 px-4 py-2">${cell}</${cellTag}>`).join('');
    return `<tr>${cellsHtml}</tr>`;
  });

  // Wrap consecutive <tr> in <table>
  html = html.replace(/(<tr>.*<\/tr>\n?)+/gi, (match) => {
    return `<div class="overflow-x-auto my-6"><table class="min-w-full border-collapse border border-gray-200">${match}</table></div>`;
  });

  // Paragraphs - wrap lines that aren't already wrapped
  const lines = html.split('\n');
  const processedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<')) return line;
    return `<p>${trimmed}</p>`;
  });
  html = processedLines.join('\n');

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

export function ArticleContent({ content }: ArticleContentProps) {
  const htmlContent = useMemo(() => markdownToHtml(content), [content]);

  return (
    <div
      className="prose prose-indigo prose-lg max-w-none
        prose-headings:font-bold prose-headings:text-gray-900
        prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
        prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
        prose-p:text-gray-600 prose-p:leading-relaxed prose-p:my-4
        prose-li:text-gray-600 prose-li:my-1
        prose-strong:text-gray-900
        prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
