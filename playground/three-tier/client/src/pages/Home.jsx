import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export default function Home() {
  const { user, logout } = useAuth();
  return (
    <div className="card narrow center">
      <h1>You are logged in</h1>
      <p>Signed in as <strong>{user.full_name}</strong> ({user.email})</p>
      {user.role === "admin" && <p><Link to="/admin">Open admin dashboards →</Link></p>}
      <button onClick={logout}>Log out</button>
    </div>
  );
}
