import { useCallback, useEffect, useState } from "react";
import type { State } from "@hovi/shared";
import { getState, putState } from "./lib/api.js";

type Status = { kind: "idle" | "loading" | "saving" } | { kind: "error"; message: string };

export function App(): JSX.Element {
  const [state, setState] = useState<State | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const load = useCallback(async () => {
    setStatus({ kind: "loading" });
    try {
      const res = await getState();
      setState(res.state);
      setUpdatedAt(res.updatedAt);
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", message: String(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async () => {
    if (!state || !updatedAt) return;
    setStatus({ kind: "saving" });
    const res = await putState(state, updatedAt);
    if (res.ok) {
      setUpdatedAt(res.updatedAt);
      setStatus({ kind: "idle" });
    } else if (res.conflict) {
      setState(res.state);
      setUpdatedAt(res.updatedAt);
      setStatus({ kind: "error", message: "Konflikti — tila päivitetty palvelimelta." });
    } else {
      setStatus({ kind: "error", message: res.error });
    }
  }, [state, updatedAt]);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1rem", maxWidth: 720 }}>
      <h1>Hovimestari</h1>
      <p>Phase 0 stub — fetches /api/state and renders the JSON blob.</p>
      <p>
        <strong>updatedAt:</strong> {updatedAt ?? "(none)"}
      </p>
      <p>
        <strong>status:</strong>{" "}
        {status.kind === "error" ? `error: ${status.message}` : status.kind}
      </p>
      <button onClick={onSave} disabled={!state || !updatedAt || status.kind === "saving"}>
        Tallenna testimerkintä
      </button>
      <pre style={{ background: "#efe6d2", padding: "1rem", overflow: "auto" }}>
        {state ? JSON.stringify(state, null, 2) : "(loading)"}
      </pre>
    </main>
  );
}
