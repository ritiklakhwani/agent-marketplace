import { PortfolioRow } from "@/lib/mockData";

type PortfolioViewProps = {
  rows: PortfolioRow[];
};

const B = "rgba(0,0,0,0.22)";

export function PortfolioView({ rows }: PortfolioViewProps) {
  return (
    <section className="shrink-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Portfolio</p>
          <p className="text-[12px] text-text-tertiary">Current vs target</p>
        </div>
        <span className="text-[12px] font-medium px-3 py-1" style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}>
          Devnet · xStocks
        </span>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr style={{ borderBottom: `1px solid ${B}` }}>
            {["Asset", "Target", "Current", "Drift"].map((h) => (
              <th key={h} className="px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const drift = row.target - row.current;
            return (
              <tr
                key={row.symbol}
                className="transition-colors duration-100"
                style={{ borderBottom: `1px solid ${B}` }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.02)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td className="px-6 py-4 text-[14px] font-semibold font-mono text-text-primary">{row.symbol}</td>
                <td className="px-6 py-4 text-[14px] tabular-nums text-text-secondary">{row.target}%</td>
                <td className="px-6 py-4 text-[14px] tabular-nums text-text-secondary">{row.current}%</td>
                <td className="px-6 py-4">
                  <span className="text-[12px] font-medium tabular-nums px-2 py-1" style={{ background: "rgba(0,0,0,0.05)", color: "#111111", border: `1px solid ${B}` }}>
                    {drift > 0 ? "+" : ""}{drift}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
