import "../../landing.css";

export default function Loading() {
  return (
    <div className="landing-v2 card-journal">
      {/* Terminal bar skeleton */}
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-hidden="true">
          <span className="cj-crumb">Cards</span>
          <span className="cj-sep">/</span>
          <span className="cj-skeleton cj-skeleton-inline" style={{ width: 80 }} />
          <span className="cj-sep">/</span>
          <span className="cj-skeleton cj-skeleton-inline" style={{ width: 180 }} />
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions" aria-hidden="true">
          <span className="cj-skeleton cj-skeleton-dark" style={{ width: 36, height: 12 }} />
          <span className="cj-skeleton cj-skeleton-dark" style={{ width: 48, height: 12 }} />
          <span className="cj-skeleton cj-skeleton-dark" style={{ width: 32, height: 12 }} />
        </div>
      </div>

      <div className="cj-layout">
        {/* Left ToC */}
        <aside className="cj-toc">
          <div className="cj-toc-heading">Contents</div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="cj-toc-link">
              <span className="cj-toc-num">0{i}</span>
              <span className="cj-skeleton" style={{ height: 12, width: 100 }} />
            </div>
          ))}
        </aside>

        {/* Main */}
        <main className="cj-main">
          {/* 01 Overview skeleton */}
          <section className="cj-section">
            <div className="cj-section-num">01 · overview</div>
            <div className="cj-overview-grid">
              <div>
                <span
                  className="cj-skeleton"
                  style={{ height: 56, width: "85%", display: "block", marginTop: 6 }}
                />
                <span
                  className="cj-skeleton"
                  style={{ height: 56, width: "55%", display: "block", marginTop: 8 }}
                />
                <span
                  className="cj-skeleton"
                  style={{ height: 14, width: 110, display: "block", marginTop: 18 }}
                />
                <span
                  className="cj-skeleton"
                  style={{ height: 14, width: "78%", display: "block", marginTop: 12 }}
                />
              </div>
              <div className="cj-overview-img">
                <div
                  className="cj-skeleton"
                  style={{ aspectRatio: "1.586 / 1", width: "100%", borderRadius: 8 }}
                />
              </div>
            </div>

            {/* 5-cell read-off strip skeleton */}
            <div className="cj-readoff">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="cj-readoff-cell">
                  <span className="cj-skeleton" style={{ height: 11, width: 60 }} />
                  <span
                    className="cj-skeleton"
                    style={{ height: 22, width: 70, marginTop: 8, display: "block" }}
                  />
                  <span
                    className="cj-skeleton"
                    style={{ height: 10, width: 80, marginTop: 8, display: "block" }}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* 02 Earn & credits skeleton */}
          <section className="cj-section">
            <div className="cj-section-num">02 · earn & credits</div>
            <span
              className="cj-skeleton"
              style={{ height: 30, width: 220, display: "block", marginTop: 6, marginBottom: 20 }}
            />
            <div className="cj-two-up">
              {[0, 1].map((col) => (
                <div key={col}>
                  <span
                    className="cj-skeleton"
                    style={{ height: 12, width: 90, display: "block", marginBottom: 8 }}
                  />
                  <div style={{ border: "1px solid var(--line-2)" }}>
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        style={{
                          padding: "12px 14px",
                          borderTop: i === 0 ? 0 : "1px solid var(--line)",
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 12,
                        }}
                      >
                        <div>
                          <span
                            className="cj-skeleton"
                            style={{ height: 14, width: "70%", display: "block" }}
                          />
                          <span
                            className="cj-skeleton"
                            style={{ height: 10, width: "50%", display: "block", marginTop: 6 }}
                          />
                        </div>
                        <span className="cj-skeleton" style={{ height: 18, width: 50 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 03 Approval odds skeleton */}
          <section className="cj-section">
            <div className="cj-section-num">03 · approval odds</div>
            <span
              className="cj-skeleton"
              style={{ height: 30, width: 180, display: "block", marginTop: 6, marginBottom: 16 }}
            />
            <div className="cj-stat-strip">
              {[0, 1, 2].map((i) => (
                <div key={i} className="cj-stat">
                  <span className="cj-skeleton" style={{ height: 11, width: 110 }} />
                  <span
                    className="cj-skeleton"
                    style={{ height: 28, width: 90, marginTop: 8, display: "block" }}
                  />
                </div>
              ))}
            </div>

            {/* FICO bucket bars */}
            <div style={{ marginTop: 24 }}>
              <span
                className="cj-skeleton"
                style={{ height: 12, width: 200, display: "block", marginBottom: 12 }}
              />
              <div className="cj-bars">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="cj-bar-row">
                    <span className="cj-skeleton" style={{ height: 10, width: 70 }} />
                    <span className="cj-skeleton" style={{ height: 14, width: "100%" }} />
                    <span className="cj-skeleton" style={{ height: 10, width: 36 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Tabbed chart slot */}
            <div className="cj-chart-stage" style={{ marginTop: 24 }}>
              <div className="cj-graph-tabs">
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ padding: "10px 16px" }}>
                    <span className="cj-skeleton" style={{ height: 12, width: 90 }} />
                  </div>
                ))}
              </div>
              <div className="cj-chart-body">
                <span
                  className="cj-skeleton"
                  style={{ height: 320, width: "100%", display: "block", borderRadius: 4 }}
                />
              </div>
            </div>
          </section>
        </main>

        {/* Right rail skeleton */}
        <aside className="cj-rail">
          {/* Welcome bonus dark box */}
          <div className="cj-apply">
            <div className="cj-apply-k">Welcome bonus</div>
            <span
              className="cj-skeleton cj-skeleton-dark"
              style={{ height: 22, width: 140, display: "block", marginTop: 6 }}
            />
            <span
              className="cj-skeleton cj-skeleton-dark"
              style={{ height: 11, width: 160, display: "block", marginTop: 8 }}
            />
            <span
              className="cj-skeleton cj-skeleton-dark"
              style={{
                height: 40,
                width: "100%",
                display: "block",
                marginTop: 16,
                borderRadius: 3,
              }}
            />
          </div>

          {/* Rating mini-card */}
          <div className="cj-rating">
            <div>
              <span className="cj-skeleton" style={{ height: 22, width: 60, display: "block" }} />
              <span
                className="cj-skeleton"
                style={{ height: 10, width: 80, display: "block", marginTop: 4 }}
              />
            </div>
            <span className="cj-skeleton" style={{ height: 14, width: 80 }} />
          </div>

          {/* Compare CTA */}
          <span
            className="cj-skeleton"
            style={{ height: 44, width: "100%", display: "block", marginBottom: 20, borderRadius: 3 }}
          />

          {/* News rail block */}
          <div className="cj-rail-block">
            <div className="cj-rail-label">Card news</div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="cj-news-item">
                <span className="cj-skeleton" style={{ height: 10, width: 80, display: "block" }} />
                <span
                  className="cj-skeleton"
                  style={{ height: 13, width: "92%", display: "block", marginTop: 6 }}
                />
                <span
                  className="cj-skeleton"
                  style={{ height: 13, width: "65%", display: "block", marginTop: 4 }}
                />
              </div>
            ))}
          </div>

          {/* Alternatives rail block */}
          <div className="cj-rail-block">
            <div className="cj-rail-label">Alternatives</div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cj-sim-row" style={{ cursor: "default" }}>
                <span className="cj-skeleton" style={{ height: 30, width: 48, borderRadius: 3 }} />
                <div style={{ minWidth: 0 }}>
                  <span className="cj-skeleton" style={{ height: 12, width: "80%", display: "block" }} />
                  <span
                    className="cj-skeleton"
                    style={{ height: 10, width: "55%", display: "block", marginTop: 4 }}
                  />
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
