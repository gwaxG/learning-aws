import { useState } from "react";
import { useFetch } from "./useFetch";

const PAGE = 25;

export default function Tables() {
  const list = useFetch("/admin/tables");
  const [name, setName] = useState(null);
  const [offset, setOffset] = useState(0);
  const rows = useFetch(name ? `/admin/tables/${name}?limit=${PAGE}&offset=${offset}` : "/admin/tables");

  if (list.loading) return <p>Loading…</p>;
  if (list.error) return <p className="error">{list.error}</p>;

  const pick = (n) => {
    setName(n);
    setOffset(0);
  };
  const t = name && rows.data && rows.data.name === name ? rows.data : null;

  return (
    <>
      <h2>Database tables <small>(read-only)</small></h2>
      <div className="chips">
        {list.data.map((x) => (
          <button key={x.name} className={x.name === name ? "active" : ""} onClick={() => pick(x.name)}>
            {x.name} <span className="muted">({x.rows})</span>
          </button>
        ))}
      </div>
      {name && rows.error && <p className="error">{rows.error}</p>}
      {t && (
        <>
          <table>
            <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i}>{t.columns.map((c) => <td key={c}>{String(r[c] ?? "∅")}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <button disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>← Prev</button>
            <span>{t.total === 0 ? "0" : `${offset + 1}–${Math.min(offset + PAGE, t.total)}`} of {t.total}</span>
            <button disabled={offset + PAGE >= t.total} onClick={() => setOffset(offset + PAGE)}>Next →</button>
          </div>
        </>
      )}
    </>
  );
}
