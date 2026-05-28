import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/stateContext.js";
import { ListTab } from "../tabs/ListTab.js";

export function ListRoute(): JSX.Element | null {
  const { state, mutate, checked, toggleChecked, clearChecked } = useStore();
  const navigate = useNavigate();
  if (!state) return null;
  return (
    <ListTab
      state={state}
      mutate={mutate}
      checked={checked}
      toggleChecked={toggleChecked}
      clearChecked={clearChecked}
      goPlan={() => navigate("/")}
    />
  );
}
