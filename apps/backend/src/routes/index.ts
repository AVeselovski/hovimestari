import { Router, type Router as IRouter } from "express";
import { uuidParam } from "../middleware/uuidParam.js";
import { accessEventsRouter } from "./accessEvents.js";
import { accessTokensRouter } from "./accessTokens.js";
import { accountsRouter } from "./accounts.js";
import { authRouter } from "./auth.js";
import { balanceRouter } from "./balance.js";
import { bucketsRouter } from "./buckets.js";
import { budgetsRouter } from "./budgets.js";
import { dashboardRouter } from "./dashboard.js";
import { dashboardBucketsRouter } from "./dashboardBuckets.js";
import { dashboardInsightsRouter } from "./dashboardInsights.js";
import { dashboardTrendsRouter } from "./dashboardTrends.js";
import { driveRouter } from "./drive.js";
import { driveCallbackRouter } from "./driveCallback.js";
import { invitationsRouter } from "./invitations.js";
import { obligationItemsRouter } from "./obligationItems.js";
import { onPointRouter } from "./onPoint.js";
import { payeesRouter } from "./payees.js";
import { receivablesRouter } from "./receivables.js";
import { recurringTemplatesRouter } from "./recurringTemplates.js";
import { spendingRouter } from "./spending.js";
import { tagsRouter } from "./tags.js";
import { taxRouter } from "./tax.js";
import { transactionFilesRouter } from "./transactionFiles.js";
import { transactionsRouter } from "./transactions.js";
import { usersRouter } from "./users.js";
import { vaultsRouter } from "./vaults.js";

export const router: IRouter = Router();
// The files router is mounted under the transaction id, so its guard is here.
// Every other UUID path param is guarded on its own router (uuidParam).
router.param("txnId", uuidParam("Transaction not found."));
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/vaults", vaultsRouter);
router.use("/vaults/:vaultId/accounts", accountsRouter);
router.use("/vaults/:vaultId/buckets", bucketsRouter);
router.use("/vaults/:vaultId/budgets", budgetsRouter);
router.use("/vaults/:vaultId/payees", payeesRouter);
router.use("/vaults/:vaultId/tags", tagsRouter);
// A row's files: a router of their own, so multipart and the Drive guards stay off the transactions routes.
router.use("/vaults/:vaultId/transactions/:txnId/files", transactionFilesRouter);
router.use("/vaults/:vaultId/transactions", transactionsRouter);
router.use("/vaults/:vaultId/recurring-templates", recurringTemplatesRouter);
// More specific /dashboard/* sub-routes are registered before the bare
// /dashboard router as a defensive convention — Express's per-router
// fallthrough (next() on no match) would resolve these correctly either way,
// since dashboardRouter's lone GET "/" doesn't match a remaining path
// segment like "/insights", but keeping the specific routes first avoids
// relying on that fallthrough behavior.
router.use("/vaults/:vaultId/dashboard/insights", dashboardInsightsRouter);
router.use("/vaults/:vaultId/dashboard/buckets", dashboardBucketsRouter);
router.use("/vaults/:vaultId/dashboard/trends", dashboardTrendsRouter);
router.use("/vaults/:vaultId/dashboard", dashboardRouter);
// Registered before balanceRouter (mounted at the bare /vaults/:vaultId) —
// the same defensive specific-before-general ordering as the dashboard
// sub-routes above (docs/design/spending-facts.md §d.1).
router.use("/vaults/:vaultId/spending", spendingRouter);
// Issue #183 — registered before balanceRouter (mounted at the bare
// /vaults/:vaultId), the same specific-before-general convention as
// /spending above.
router.use("/vaults/:vaultId/receivables", receivablesRouter);
// Issue #185 — registered before balanceRouter (mounted at the bare
// /vaults/:vaultId), the same specific-before-general convention as
// /receivables above.
router.use("/vaults/:vaultId/tax", taxRouter);
// Issue #176 — both registered before balanceRouter (mounted at the bare
// /vaults/:vaultId), the same specific-before-general convention as /tax
// above.
router.use("/vaults/:vaultId/on-point", onPointRouter);
router.use("/vaults/:vaultId/obligation-items", obligationItemsRouter);
// Issues #282 and #300 — registered before balanceRouter (mounted at the
// bare /vaults/:vaultId), the same specific-before-general convention as
// /on-point above.
router.use("/vaults/:vaultId/access-tokens", accessTokensRouter);
router.use("/vaults/:vaultId/access-events", accessEventsRouter);
// Registered before balanceRouter (mounted at the bare /vaults/:vaultId),
// the same specific-before-general convention as above.
router.use("/vaults/:vaultId/drive", driveRouter);
router.use("/vaults/:vaultId", balanceRouter);
router.use("/invitations", invitationsRouter);
// Google returns to one fixed URI, so the Drive callback names no vault.
router.use("/drive", driveCallbackRouter);
