import { PortfolioRow } from "@/lib/mockData";

type PortfolioViewProps = {
  rows: PortfolioRow[];
};

const B = "rgba(0,0,0,0.08)";

export function PortfolioView({ rows }: PortfolioViewProps) {
  return (
    <section className="shrink-0 flex flex-col" style={{ borderBottom: `1px solid ${B}` }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${B}` }}>
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Portfolio</p>
          <p className="text-[10px] text-text-tertiary">Current vs target</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5" style={{ background: "rgba(14,165,233,0.08)", color: "#0284c7" }}>
          Devnet · xStocks
        </span>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr style={{ borderBottom: `1px solid ${B}` }}>
            {["Asset", "Target", "Current", "Drift"].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
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
                <td className="px-4 py-2 text-[11px] font-semibold font-mono text-text-primary">{row.symbol}</td>
                <td className="px-4 py-2 text-[11px] tabular-nums text-text-secondary">{row.target}%</td>
                <td className="px-4 py-2 text-[11px] tabular-nums text-text-secondary">{row.current}%</td>
                <td className="px-4 py-2">
                  <span className="text-[10px] font-medium tabular-nums px-1.5 py-0.5" style={{ background: "rgba(202,138,4,0.10)", color: "#92400e" }}>
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
