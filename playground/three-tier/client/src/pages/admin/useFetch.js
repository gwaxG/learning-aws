import { useEffect, useState } from "react";
import { api } from "../../api";

export function useFetch(path) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: "", loading: true });
    api(path)
      .then((data) => alive && setState({ data, error: "", loading: false }))
      .catch((e) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}
