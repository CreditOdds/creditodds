/** Boxed "Follow @creditodds" callout with an X logo and Follow button.
 * Styled by the .x-follow rules in landing.css; server-safe (no hooks). */
export function FollowXCallout({ sub }: { sub: string }) {
  return (
    <a
      className="x-follow"
      href="https://x.com/creditodds"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="x-follow-copy">
        <span className="x-follow-handle">
          <svg className="x-follow-logo" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
            />
          </svg>
          @creditodds
        </span>
        <span className="x-follow-sub">{sub}</span>
      </span>
      <span className="x-follow-btn">Follow</span>
    </a>
  );
}
