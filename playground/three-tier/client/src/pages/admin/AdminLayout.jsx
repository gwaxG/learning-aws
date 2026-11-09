import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="admin">
      <header>
        <strong>Admin</strong>
        <nav>
          <NavLink to="/admin" end>Dashboard</NavLink>
          <NavLink to="/admin/users">Users</NavLink>
          <NavLink to="/admin/tables">Tables</NavLink>
          <NavLink to="/">Home</NavLink>
        </nav>
        <span className="spacer" />
        <span>{user.email}</span>
        <button onClick={logout}>Log out</button>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
