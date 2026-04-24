import "../../landing.css";

export default function Loading() {
  return (
    <div className="landing-v2 card-journal">
      {/* Terminal bar skeleton */}
      <div className="cj-terminal">
        <span className="cj-brand">creditodds</span>
        <span className="cj-dim">/ card /</span>
        <span className="cj-skeleton cj-skeleton-inline" style={{ width: 120 }} />
        <span className="cj-dim">/</span>
        <span className="cj-skeleton cj-skeleton-inline" style={{ width: 180 }} />
        <span className="cj-spacer" />
        <span className="cj-skeleton cj-skeleton-inline" style={{ width: 100 }} />
      </div>

      <div className="cj-layout">
        {/* Left ToC skeleton */}
        <aside className="cj-toc">
          <div className="cj-toc-heading">Contents</div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cj-toc-link">
              <span className="cj-toc-num">0{i + 1}</span>
              <span className="cj-skeleton" style={{ height: 12, width: 90 }} />
            </div>
          ))}
          <div className="cj-toc-divider">
            <div className="cj-toc-block-label">Community rate</div>
            <span className="cj-skeleton" style={{ height: 28, width: 90, marginTop: 4 }} />
            <span className="cj-skeleton" style={{ height: 10, width: 120, marginTop: 8 }} />
          </div>
        </aside>

        {/* Main */}
        <main className="cj-main">
          {/* Overview skeleton */}
          <section className="cj-section">
            <div className="cj-section-num">01 · overview</div>
            <div className="cj-overview-grid">
              <div>
                <span className="cj-skeleton" style={{ height: 56, width: "85%", display: "block", marginTop: 6 }} />
                <span className="cj-skeleton" style={{ height: 56, width: "60%", display: "block", marginTop: 8 }} />
                <span className="cj-skeleton" style={{ height: 14, width: "92%", display: "block", marginTop: 16 }} />
                <span className="cj-skeleton" style={{ height: 14, width: "78%", display: "block", marginTop: 6 }} />
              </div>
              <div className="cj-overview-img">
                <div className="cj-skeleton" style={{ aspectRatio: "1.586 / 1", width: "100%", borderRadius: 8 }} />
              </div>
            </div>

            {/* Read-off strip skeleton */}
            <div className="cj-readoff">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="cj-readoff-cell">
                  <span className="cj-skeleton" style={{ height: 10, width: 40 }} />
                  <span className="cj-skeleton" style={{ height: 22, width: 70, marginTop: 6, display: "block" }} />
                </div>
              ))}
            </div>
          </section>

          {/* Earn & credits skeleton */}
          <section className="cj-section">
            <div className="cj-section-num">02 · earn & credits</div>
            <span className="cj-skeleton" style={{ height: 30, width: 180, display: "block", marginTop: 6, marginBottom: 20 }} />
            <div className="cj-two-up">
              {[0, 1].map(col => (
                <div key={col}>
                  <span className="cj-skeleton" style={{ height: 12, width: 90, display: "block", marginBottom: 8 }} />
                  <div style={{ border: "1px solid var(--line-2)" }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} style={{ padding: "12px 14px", borderTop: i === 0 ? 0 : "1px solid var(--line)", display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                        <div>
                          <span className="cj-skeleton" style={{ height: 14, width: "70%", display: "block" }} />
                          <span className="cj-skeleton" style={{ height: 10, width: "50%", display: "block", marginTop: 6 }} />
                        </div>
                        <span className="cj-skeleton" style={{ height: 18, width: 50 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Odds skeleton */}
          <section className="cj-section">
            <div className="cj-section-num">03 · approval odds</div>
            <span className="cj-skeleton" style={{ height: 30, width: 160, display: "block", marginTop: 6, marginBottom: 16 }} />
            <div className="cj-stat-strip">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="cj-stat">
                  <span className="cj-skeleton" style={{ height: 10, width: 100 }} />
                  <span className="cj-skeleton" style={{ height: 30, width: 90, marginTop: 8, display: "block" }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 22 }}>
              <span className="cj-skeleton" style={{ height: 12, width: 180, display: "block", marginBottom: 10 }} />
              <div className="cj-bars">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="cj-bar-row">
                    <span className="cj-skeleton" style={{ height: 10, width: 60 }} />
                    <span className="cj-skeleton" style={{ height: 14, width: "100%" }} />
                    <span className="cj-skeleton" style={{ height: 10, width: 30 }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        {/* Right rail skeleton */}
        <aside className="cj-rail">
          <div className="cj-apply">
            <div className="cj-apply-k">Apply</div>
            <span className="cj-skeleton cj-skeleton-dark" style={{ height: 22, width: 140, display: "block", marginTop: 6 }} />
            <span className="cj-skeleton cj-skeleton-dark" style={{ height: 11, width: 110, display: "block", marginTop: 6 }} />
            <span className="cj-skeleton cj-skeleton-dark" style={{ height: 40, width: "100%", display: "block", marginTop: 14, borderRadius: 3 }} />
          </div>

          <div className="cj-rail-block">
            <div className="cj-rail-label">Watchlist</div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="cj-news-item">
                <span className="cj-skeleton" style={{ height: 10, width: 80, display: "block" }} />
                <span className="cj-skeleton" style={{ height: 13, width: "90%", display: "block", marginTop: 6 }} />
                <span className="cj-skeleton" style={{ height: 13, width: "65%", display: "block", marginTop: 4 }} />
              </div>
            ))}
          </div>

          <div className="cj-rail-block">
            <div className="cj-rail-label">Alternatives</div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="cj-sim-row" style={{ cursor: "default" }}>
                <span className="cj-skeleton" style={{ height: 30, width: 48, borderRadius: 3 }} />
                <div style={{ minWidth: 0 }}>
                  <span className="cj-skeleton" style={{ height: 12, width: "80%", display: "block" }} />
                  <span className="cj-skeleton" style={{ height: 10, width: "55%", display: "block", marginTop: 4 }} />
                </div>
                <span className="cj-skeleton" style={{ height: 14, width: 32 }} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
