import "../landing.css";

function Bar({ w, h = 12, r = 6 }: { w: string | number; h?: number; r?: number }) {
  return (
    <div
      className="sk-pulse"
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: h,
        borderRadius: r,
      }}
    />
  );
}

export default function Loading() {
  return (
    <div className="landing-v2">
      <style>{`
        .sk-pulse {
          background: linear-gradient(90deg, #ece8f5 0%, #f5f1fb 50%, #ece8f5 100%);
          background-size: 200% 100%;
          animation: skShimmer 1.4s ease-in-out infinite;
        }
        @keyframes skShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .sk-cc {
          background: #fff;
          border: 1px solid #ddd7ec;
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sk-cc-top { display: flex; align-items: flex-start; gap: 14px; }
        .sk-cc-thumb { width: 68px; height: 44px; border-radius: 6px; flex-shrink: 0; }
        .sk-cc-rows {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          border-top: 1px dashed #ece8f5;
          padding-top: 12px;
        }
        .sk-cc-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 10px;
          border-top: 1px solid #ece8f5;
        }
        .sk-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          padding: 32px 0 80px;
        }
        @media (max-width: 960px) { .sk-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .sk-grid { grid-template-columns: 1fr; } }
        .sk-filter {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 20px 0 8px;
          border-bottom: 1px solid #ece8f5;
        }
        .sk-search-row { display: flex; gap: 10px; align-items: center; }
        .sk-chip-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      `}</style>

      <section className="page-hero wrap">
        <h1 className="page-title" aria-hidden="true">
          <Bar w="min(560px, 80%)" h={44} r={8} />
        </h1>
        <p className="page-sub" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden="true">
          <Bar w="min(640px, 90%)" h={14} />
          <Bar w="min(420px, 60%)" h={14} />
        </p>
      </section>

      <div className="wrap">
        <div className="sk-filter" aria-hidden="true">
          <div className="sk-search-row">
            <Bar w="100%" h={40} r={10} />
            <Bar w={84} h={40} r={10} />
          </div>
          <div className="sk-chip-row">
            <Bar w={40} h={14} />
            {[64, 92, 80, 72].map((w, i) => (
              <Bar key={i} w={w} h={28} r={999} />
            ))}
          </div>
          <div className="sk-chip-row">
            <Bar w={32} h={14} />
            {[60, 88, 100, 92, 110].map((w, i) => (
              <Bar key={i} w={w} h={28} r={999} />
            ))}
          </div>
          <div className="sk-chip-row" style={{ justifyContent: 'space-between' }}>
            <div className="sk-chip-row">
              <Bar w={32} h={14} />
              {[80, 80, 80, 80].map((w, i) => (
                <Bar key={i} w={w} h={28} r={999} />
              ))}
            </div>
            <Bar w={120} h={14} />
          </div>
        </div>

        <div className="sk-grid" role="status" aria-label="Loading cards">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="sk-cc">
              <div className="sk-cc-top">
                <div className="sk-cc-thumb sk-pulse" />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Bar w="80%" h={14} />
                  <Bar w="55%" h={11} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <Bar w={56} h={22} />
                  <Bar w={48} h={10} />
                </div>
              </div>
              <div className="sk-cc-rows">
                <Bar w="60%" h={11} />
                <Bar w="40%" h={11} />
                <Bar w="55%" h={11} />
                <Bar w="50%" h={11} />
                <Bar w="50%" h={11} />
                <Bar w="60%" h={11} />
                <Bar w="65%" h={11} />
                <Bar w="55%" h={11} />
              </div>
              <div className="sk-cc-foot">
                <Bar w={90} h={11} />
                <Bar w={48} h={16} r={4} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
