import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/stateContext.js";
import { PlanTab } from "../tabs/PlanTab.js";

export function PlanRoute(): JSX.Element | null {
  const { state, mutate } = useStore();
  const navigate = useNavigate();
  if (!state) return null;
  return <PlanTab state={state} mutate={mutate} goList={() => navigate("/list")} />;
}
