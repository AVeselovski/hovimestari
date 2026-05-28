import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout.js";
import { PlanRoute } from "./routes/PlanRoute.js";
import { RecipesRoute } from "./routes/RecipesRoute.js";
import { RecipeNewRoute } from "./routes/RecipeNewRoute.js";
import { RecipeEditRoute } from "./routes/RecipeEditRoute.js";
import { RecipeDetail } from "./routes/RecipeDetail.js";
import { StaplesRoute } from "./routes/StaplesRoute.js";
import { ListRoute } from "./routes/ListRoute.js";
import { NotFound } from "./routes/NotFound.js";

const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <PlanRoute /> },
      { path: "/recipes", element: <RecipesRoute /> },
      { path: "/recipes/new", element: <RecipeNewRoute /> },
      { path: "/recipes/:id", element: <RecipeDetail /> },
      { path: "/recipes/:id/edit", element: <RecipeEditRoute /> },
      { path: "/staples", element: <StaplesRoute /> },
      { path: "/list", element: <ListRoute /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router: ReturnType<typeof createBrowserRouter> =
  createBrowserRouter(routes);
