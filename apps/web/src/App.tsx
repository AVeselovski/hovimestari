import { RouterProvider } from "react-router-dom";
import { router } from "./router.js";

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
