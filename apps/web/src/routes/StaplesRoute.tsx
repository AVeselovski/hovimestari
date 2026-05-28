import { useStore } from "../lib/stateContext.js";
import { StaplesTab } from "../tabs/StaplesTab.js";

export function StaplesRoute(): JSX.Element | null {
  const { state, mutate } = useStore();
  if (!state) return null;
  return <StaplesTab state={state} mutate={mutate} />;
}
