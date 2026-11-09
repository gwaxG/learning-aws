import { useFetch } from "./useFetch";

const fmt = (iso) => new Date(iso).toLocaleString();

export default function Dashboard() {
  const { data, error, loading } = useFetch("/admin/stats");
  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  const tiles = [
    ["Users", data.users_total],
    ["Active users", data.users_active],
    ["Admins", data.admins],
    ["Logins (24h)", data.logins_24h],
    ["Failed logins (24h)", data.failed_logins_24h],
  ];
  return (
    <>
      <h2>Dashboard</h2>
      <div className="tiles">
        {tiles.map(([label, value]) => (
          <div className="tile" key={label}><div className="num">{value}</div>{label}</div>
        ))}
      </div>
      <h3>Recent login attempts</h3>
      <table>
        <thead><tr><th>When</th><th>Email</th><th>Result</th><th>IP</th></tr></thead>
        <tbody>
          {data.recent_events.map((e) => (
            <tr key={e.id}>
              <td>{fmt(e.created_at)}</td><td>{e.email}</td>
              <td className={e.success ? "ok" : "error"}>{e.success ? "success" : "failed"}</td><td>{e.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
