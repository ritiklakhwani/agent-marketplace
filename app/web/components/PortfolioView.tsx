import { PortfolioRow } from "@/lib/mockData";

type PortfolioViewProps = {
  rows: PortfolioRow[];
};

export function PortfolioView({ rows }: PortfolioViewProps) {
  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Portfolio View</p>
          <p className="text-sm text-zinc-500">
            Current vs target allocation for the flagship demo.
          </p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
          Devnet · xStocks preview
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Target %</th>
              <th className="px-4 py-3 font-medium">Current %</th>
              <th className="px-4 py-3 font-medium">Drift %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const drift = row.target - row.current;

              return (
                <tr key={row.symbol} className="border-t border-zinc-200">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {row.symbol}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{row.target}%</td>
                  <td className="px-4 py-3 text-zinc-700">{row.current}%</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      {drift > 0 ? "+" : ""}
                      {drift}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
