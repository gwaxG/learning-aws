import { useFetch } from "./useFetch";

export default function Users() {
  const { data, error, loading } = useFetch("/admin/users");
  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  return (
    <>
      <h2>Users</h2>
      <table>
        <thead><tr><th>ID</th><th>Email</th><th>Name</th><th>Role</th><th>Active</th><th>Created</th><th>Last login</th></tr></thead>
        <tbody>
          {data.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td><td>{u.email}</td><td>{u.full_name}</td><td>{u.role}</td>
              <td>{u.is_active ? "yes" : "no"}</td>
              <td>{new Date(u.created_at).toLocaleString()}</td>
              <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
