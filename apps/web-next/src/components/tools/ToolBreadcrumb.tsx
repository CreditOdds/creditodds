import Link from 'next/link';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ToolBreadcrumbProps {
  toolName: string;
  toolSlug: string;
}

export default function ToolBreadcrumb({ toolName, toolSlug }: ToolBreadcrumbProps) {
  const issueUrl = `https://github.com/CreditOdds/creditodds/issues/new?${new URLSearchParams({
    title: `Tool page issue: ${toolName}`,
    labels: 'tool-data',
    body: [
      `**Tool:** ${toolName}`,
      `**Page:** https://creditodds.com/tools/${toolSlug}`,
      '',
      "### What's wrong?",
      '<!-- e.g. wrong cents-per-point value, broken calculator, outdated valuation, missing context -->',
      '',
      '### What should it say?',
      "<!-- the correct value or behavior, ideally with a link to a source -->",
      '',
      '### Source / proof',
      '<!-- link to the source or screenshot showing the correct info -->',
    ].join('\n'),
  }).toString()}`;

  return (
    <div className="cj-terminal">
      <nav className="cj-crumbs" aria-label="Breadcrumb">
        <Link href="/tools" className="cj-crumb">Tools</Link>
        <span className="cj-sep">/</span>
        <span className="cj-crumb cj-crumb-current" aria-current="page">{toolName}</span>
      </nav>
      <span className="cj-spacer" />
      <div className="cj-term-actions">
        <a
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cj-term-link"
          title="Report an issue with this tool"
        >
          <ExclamationTriangleIcon className="cj-term-icon" />
          report issue
        </a>
      </div>
    </div>
  );
}
