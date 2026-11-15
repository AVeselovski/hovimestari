import type {
  Account,
  AccountAdjustment,
  AccountReconcileBody,
  AccountWithBalance,
  BudgetsOverviewResponse,
  BulkTagBody,
  BulkTagResponse,
  BulkUpdateBody,
  BulkUpdateResponse,
  CreateAccountAdjustmentBody,
  CreateAccountBody,
  CreateDebtPaymentBody,
  CreateObligationItemBody,
  CreateRecurringTemplateBody,
  CreateTransactionBody,
  DashboardBucketDrilldown,
  DashboardInsightsResponse,
  DashboardResponse,
  DashboardTrendsResponse,
  DebtPaymentResponse,
  DebtProjectionQuery,
  DebtProjectionWithScenario,
  FrequentPayeesResponse,
  NetWorthSummary,
  ObligationItem,
  OnPointResponse,
  OpeningBalanceBody,
  ReceivablesResponse,
  RecurringCommitmentsResponse,
  RecurringTemplate,
  RecurringTemplateListResponse,
  SpendingFactsQuery,
  SpendingFactsResponse,
  SpendingYearsResponse,
  Tag,
  TagWithUsage,
  TaxObligationsResponse,
  TaxPeriodSheet,
  Transaction,
  TransactionListResponse,
  UpdateAccountAdjustmentBody,
  UpdateAccountBody,
  UpdateObligationItemBody,
  UpdateRecurringTemplateBody,
  UpdateTransactionBody,
  UserMe,
} from "@finanssiappis/types";
import axios, { type InternalAxiosRequestConfig } from "axios";
import { toSearchParams, type TransactionListQuery } from "./transactionQuery";

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

type GetTokenFn = () => string | null;
type OnRefreshSuccessFn = (accessToken: string, user: UserMe) => void;
type OnLogoutFn = () => Promise<void>;

let _getToken: GetTokenFn | null = null;
let _onRefreshSuccess: OnRefreshSuccessFn | null = null;
let _onLogout: OnLogoutFn | null = null;

let refreshPromise: Promise<void> | null = null;

export function injectAuthHandlers(handlers: {
  getAccessToken: GetTokenFn;
  onRefreshSuccess: OnRefreshSuccessFn;
  onLogout: OnLogoutFn;
}): void {
  _getToken = handlers.getAccessToken;
  _onRefreshSuccess = handlers.onRefreshSuccess;
  _onLogout = handlers.onLogout;
}

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = _getToken?.();
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetryConfig | undefined;

    if (!error.response || error.response.status !== 401 || !config) {
      return Promise.reject(error);
    }

    if (config._retry) {
      return Promise.reject(error);
    }

    config._retry = true;

    if (refreshPromise === null) {
      refreshPromise = (async () => {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("refresh failed");
        }

        const data = (await res.json()) as { accessToken: string; user: UserMe };
        _onRefreshSuccess?.(data.accessToken, data.user);
      })()
        .catch(async (err) => {
          await _onLogout?.();
          throw err;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    await refreshPromise;

    const newToken = _getToken?.();
    if (newToken) {
      config.headers["Authorization"] = `Bearer ${newToken}`;
    }

    return api(config);
  },
);

// ---------------------------------------------------------------------------
// Read options
// ---------------------------------------------------------------------------

/** `GET /vaults/:id/balance`: the header's checking balance. */
export interface HeaderBalanceData {
  balance: string | null;
  openingBalanceDate: string | null;
  message?: string;
}

/**
 * Per-request options every read helper takes as its last argument, apart
 * from any options object of its own. `signal` cancels the request: the query
 * cache passes its own, so a read no component waits for any more is
 * aborted, and a caller that has moved on (a newer period step, a newer
 * search) aborts the older one. An aborted request rejects with axios's
 * `CanceledError`.
 */
export interface RequestOptions {
  signal?: AbortSignal;
}

/** The axios config for `opts`, or nothing at all when there is nothing to pass. */
function requestConfig(req?: RequestOptions): { signal: AbortSignal } | undefined {
  return req?.signal ? { signal: req.signal } : undefined;
}

// ---------------------------------------------------------------------------
// Recurring template API helpers
// ---------------------------------------------------------------------------

export async function listRecurringTemplates(
  vaultId: string,
  params?: { isActive?: boolean },
  req?: RequestOptions,
): Promise<RecurringTemplate[]> {
  const query = new URLSearchParams();
  if (params?.isActive !== undefined) query.set("isActive", String(params.isActive));
  const qs = query.toString();
  const url = `/vaults/${vaultId}/recurring-templates${qs ? `?${qs}` : ""}`;
  const res = await api.get<RecurringTemplateListResponse>(url, requestConfig(req));
  return res.data.data;
}

export async function createRecurringTemplate(
  vaultId: string,
  body: CreateRecurringTemplateBody & { payeeName?: string },
): Promise<RecurringTemplate> {
  const res = await api.post<RecurringTemplate>(`/vaults/${vaultId}/recurring-templates`, body);
  return res.data;
}

export async function updateRecurringTemplate(
  vaultId: string,
  id: string,
  body: UpdateRecurringTemplateBody & { payeeName?: string },
): Promise<RecurringTemplate> {
  const res = await api.patch<RecurringTemplate>(`/vaults/${vaultId}/recurring-templates/${id}`, body);
  return res.data;
}

export async function deleteRecurringTemplate(vaultId: string, id: string): Promise<void> {
  await api.delete(`/vaults/${vaultId}/recurring-templates/${id}`);
}

export async function deactivateRecurringTemplate(vaultId: string, id: string): Promise<RecurringTemplate> {
  const res = await api.post<RecurringTemplate>(`/vaults/${vaultId}/recurring-templates/${id}/deactivate`);
  return res.data;
}

export async function reactivateRecurringTemplate(vaultId: string, id: string): Promise<RecurringTemplate> {
  const res = await api.post<RecurringTemplate>(`/vaults/${vaultId}/recurring-templates/${id}/reactivate`);
  return res.data;
}

/**
 * The monthly-commitments rollup for the Recurring page's panel: active
 * expense templates with a set amount, normalised to a monthly equivalent
 * and summed by bucket. A computed sub-collection of recurring-templates,
 * not the dashboard (docs/design/recurring-commitments-page.md §2).
 */
export async function getRecurringCommitments(
  vaultId: string,
  req?: RequestOptions,
): Promise<RecurringCommitmentsResponse> {
  const res = await api.get<RecurringCommitmentsResponse>(
    `/vaults/${vaultId}/recurring-templates/commitments`,
    requestConfig(req),
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Dashboard API helpers
// ---------------------------------------------------------------------------

export async function getDashboard(
  vaultId: string,
  params: { from: string; to: string },
  req?: RequestOptions,
): Promise<DashboardResponse> {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  const res = await api.get<DashboardResponse>(`/vaults/${vaultId}/dashboard?${query.toString()}`, requestConfig(req));
  return res.data;
}

export async function getDashboardInsights(
  vaultId: string,
  params: { from: string; to: string },
  req?: RequestOptions,
): Promise<DashboardInsightsResponse> {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  const res = await api.get<DashboardInsightsResponse>(
    `/vaults/${vaultId}/dashboard/insights?${query.toString()}`,
    requestConfig(req),
  );
  return res.data;
}

export async function getDashboardTrends(vaultId: string, req?: RequestOptions): Promise<DashboardTrendsResponse> {
  const res = await api.get<DashboardTrendsResponse>(`/vaults/${vaultId}/dashboard/trends`, requestConfig(req));
  return res.data;
}

/** One budget row's drill-in: the bucket's categories and top payees this month. */
export async function getDashboardBucketDrilldown(
  vaultId: string,
  bucketId: string,
  req?: RequestOptions,
): Promise<DashboardBucketDrilldown> {
  const res = await api.get<DashboardBucketDrilldown>(
    `/vaults/${vaultId}/dashboard/buckets/${bucketId}`,
    requestConfig(req),
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Receivables API helper (issue #183) — a separate endpoint, not a dashboard
// payload key (design D12), so a household vault's dashboard load issues
// this ZERO times by construction: callers must gate on `isBusiness` before
// invoking it (ReceivablesCard does; see its own docstring). Business
// vaults only server-side — a household call 400s.
// ---------------------------------------------------------------------------

export async function getReceivables(vaultId: string, req?: RequestOptions): Promise<ReceivablesResponse> {
  const res = await api.get<ReceivablesResponse>(`/vaults/${vaultId}/receivables`, requestConfig(req));
  return res.data;
}

// ---------------------------------------------------------------------------
// Tax period sheet API helper (issue #185) — business vaults only server-side
// (a household call 400s). `period` is `YYYY-MM` or the literal `current`;
// the server resolves "current" from its own UTC clock and echoes it back
// (`asOf`/`currentPeriod`) so the client never invents a second "today".
// ---------------------------------------------------------------------------

export async function getTaxPeriod(vaultId: string, period: string, req?: RequestOptions): Promise<TaxPeriodSheet> {
  const res = await api.get<TaxPeriodSheet>(`/vaults/${vaultId}/tax/periods/${period}`, requestConfig(req));
  return res.data;
}

// ---------------------------------------------------------------------------
// Tax obligations API helper (issue #188, design §f/§d) — the "Yours to
// keep" wire. Business vaults only server-side (a household call 400s);
// deliberately range-independent, no parameters. Callers must gate on
// `isBusiness` before invoking it (YoursToKeepCard does; see its own
// docstring), the ReceivablesCard posture.
// ---------------------------------------------------------------------------

export async function getTaxObligations(vaultId: string, req?: RequestOptions): Promise<TaxObligationsResponse> {
  const res = await api.get<TaxObligationsResponse>(`/vaults/${vaultId}/tax/obligations`, requestConfig(req));
  return res.data;
}

// ---------------------------------------------------------------------------
// On point API helpers (issue #176, design §f/§d) — the On point card and its
// obligation checklist. Business vaults only server-side (a household call
// 400s); `getOnPoint` is deliberately range-independent, no parameters.
// Callers must gate on `isBusiness` before invoking any of these (OnPointCard
// does; see its own docstring), the ReceivablesCard/YoursToKeepCard posture.
// ---------------------------------------------------------------------------

export async function getOnPoint(vaultId: string, req?: RequestOptions): Promise<OnPointResponse> {
  const res = await api.get<OnPointResponse>(`/vaults/${vaultId}/on-point`, requestConfig(req));
  return res.data;
}

export async function createObligationItem(vaultId: string, body: CreateObligationItemBody): Promise<ObligationItem> {
  const res = await api.post<ObligationItem>(`/vaults/${vaultId}/obligation-items`, body);
  return res.data;
}

export async function updateObligationItem(
  vaultId: string,
  itemId: string,
  body: UpdateObligationItemBody,
): Promise<ObligationItem> {
  const res = await api.patch<ObligationItem>(`/vaults/${vaultId}/obligation-items/${itemId}`, body);
  return res.data;
}

export async function deleteObligationItem(vaultId: string, itemId: string): Promise<void> {
  await api.delete(`/vaults/${vaultId}/obligation-items/${itemId}`);
}

/**
 * Ticks or unticks an item for `period` (`YYYY-MM`) — PUT to mark done
 * (idempotent), DELETE to mark undone (idempotent, D11: absence is not-done).
 * Answers nothing: the caller patches the card before the request and
 * refetches it after, so the server's version of the item is read there.
 */
export async function setObligationDone(vaultId: string, itemId: string, period: string, done: boolean): Promise<void> {
  const path = `/vaults/${vaultId}/obligation-items/${itemId}/completions/${period}`;
  if (done) await api.put(path);
  else await api.delete(path);
}

// ---------------------------------------------------------------------------
// Budgets API helpers
// ---------------------------------------------------------------------------

export async function getBudgetsOverview(vaultId: string, req?: RequestOptions): Promise<BudgetsOverviewResponse> {
  const res = await api.get<BudgetsOverviewResponse>(`/vaults/${vaultId}/budgets/overview`, requestConfig(req));
  return res.data;
}

// ---------------------------------------------------------------------------
// Spending facts API helpers (docs/design/spending-facts.md §d.1)
// ---------------------------------------------------------------------------

/**
 * The facts over one span (docs/design/analytics-page.md §6.1). The last 12
 * months, the default, sends no parameters: it is the exact request the
 * dashboard's balance alert makes.
 */
export async function getSpendingFacts(
  vaultId: string,
  query: SpendingFactsQuery = { range: "last12" },
  req?: RequestOptions,
): Promise<SpendingFactsResponse> {
  const params = new URLSearchParams();
  if (query.range !== "last12") params.set("range", query.range);
  if (query.range === "year" && query.year !== undefined) params.set("year", String(query.year));
  const search = params.toString();
  const res = await api.get<SpendingFactsResponse>(
    `/vaults/${vaultId}/spending/facts${search ? `?${search}` : ""}`,
    requestConfig(req),
  );
  return res.data;
}

/** Income and net per calendar year, every year of the vault's history (analytics-page.md §6.2). */
export async function getSpendingYears(vaultId: string, req?: RequestOptions): Promise<SpendingYearsResponse> {
  const res = await api.get<SpendingYearsResponse>(`/vaults/${vaultId}/spending/years`, requestConfig(req));
  return res.data;
}

// ---------------------------------------------------------------------------
// Payee API helpers
// ---------------------------------------------------------------------------

/**
 * Lean payee "quick pick" payload — top-N frequent payees + the latest-used
 * one, for the entry form's payee pills (see hooks/queries/usePayees.ts).
 */
export async function getFrequentPayees(vaultId: string, req?: RequestOptions): Promise<FrequentPayeesResponse> {
  const res = await api.get<FrequentPayeesResponse>(`/vaults/${vaultId}/payees/frequent`, requestConfig(req));
  return res.data;
}

// ---------------------------------------------------------------------------
// Account API helpers
// ---------------------------------------------------------------------------

export async function listAccounts(
  vaultId: string,
  opts?: { includeArchived?: boolean },
  req?: RequestOptions,
): Promise<AccountWithBalance[]> {
  const query = new URLSearchParams();
  if (opts?.includeArchived) query.set("includeArchived", "true");
  const qs = query.toString();
  const url = `/vaults/${vaultId}/accounts${qs ? `?${qs}` : ""}`;
  const res = await api.get<AccountWithBalance[]>(url, requestConfig(req));
  return res.data;
}

export async function getAccount(vaultId: string, id: string, req?: RequestOptions): Promise<AccountWithBalance> {
  const res = await api.get<AccountWithBalance>(`/vaults/${vaultId}/accounts/${id}`, requestConfig(req));
  return res.data;
}

/**
 * Contract-based payoff projection for a debt account (issue #144), with an
 * optional what-if `scenario` (design doc §12) when `scenario` carries a
 * non-empty `extraMonthly` / `extraOneOff` value — appended as query params
 * only when present, matching the server's "absent means no scenario" rule
 * (`DebtProjectionQuerySchema`). 404s when the account isn't a debt in this
 * vault. `status: 'not_configured'` carries no derived figures — see
 * `DebtProjectionSchema` (`@finanssiappis/types`).
 *
 * Issue #177: `savingsRate` / `fundReturn` are ephemeral opportunity-cost
 * overrides, appended only when present — same rule as the two extras.
 * Absent means "use the vault's stored default" server-side; there is no
 * client-side fallback value sent in their place.
 */
export async function getDebtProjection(
  vaultId: string,
  accountId: string,
  scenario?: DebtProjectionQuery,
  req?: RequestOptions,
): Promise<DebtProjectionWithScenario> {
  const query = new URLSearchParams();
  if (scenario?.extraMonthly) query.set("extraMonthly", scenario.extraMonthly);
  if (scenario?.extraOneOff) query.set("extraOneOff", scenario.extraOneOff);
  if (scenario?.savingsRate) query.set("savingsRate", scenario.savingsRate);
  if (scenario?.fundReturn) query.set("fundReturn", scenario.fundReturn);
  const qs = query.toString();
  const res = await api.get<DebtProjectionWithScenario>(
    `/vaults/${vaultId}/accounts/${accountId}/debt-projection${qs ? `?${qs}` : ""}`,
    requestConfig(req),
  );
  return res.data;
}

/**
 * Record-payment (issue #144, slice 1b): one atomic request that writes the
 * principal transfer + interest/fee expense pair. See `DebtPaymentForm.tsx`
 * for the client-side split-consistency UX and `CreateDebtPaymentBodySchema`
 * (`@finanssiappis/types`) for the server's own `total === principal +
 * interest + fee` contract.
 */
export async function createDebtPayment(
  vaultId: string,
  accountId: string,
  body: CreateDebtPaymentBody,
): Promise<DebtPaymentResponse> {
  const res = await api.post<DebtPaymentResponse>(`/vaults/${vaultId}/accounts/${accountId}/debt-payments`, body);
  return res.data;
}

export async function createAccount(
  vaultId: string,
  body: CreateAccountBody & { payeeName?: string },
): Promise<AccountWithBalance> {
  const res = await api.post<AccountWithBalance>(`/vaults/${vaultId}/accounts`, body);
  return res.data;
}

export async function updateAccount(
  vaultId: string,
  id: string,
  body: UpdateAccountBody & { payeeName?: string },
): Promise<AccountWithBalance> {
  const res = await api.patch<AccountWithBalance>(`/vaults/${vaultId}/accounts/${id}`, body);
  return res.data;
}

export async function archiveAccount(vaultId: string, id: string): Promise<AccountWithBalance> {
  const res = await api.post<AccountWithBalance>(`/vaults/${vaultId}/accounts/${id}/archive`);
  return res.data;
}

export async function unarchiveAccount(vaultId: string, id: string): Promise<AccountWithBalance> {
  const res = await api.post<AccountWithBalance>(`/vaults/${vaultId}/accounts/${id}/unarchive`);
  return res.data;
}

export async function listAccountAdjustments(
  vaultId: string,
  accountId: string,
  req?: RequestOptions,
): Promise<AccountAdjustment[]> {
  const res = await api.get<AccountAdjustment[]>(
    `/vaults/${vaultId}/accounts/${accountId}/adjustments`,
    requestConfig(req),
  );
  return res.data;
}

export async function createAccountAdjustment(
  vaultId: string,
  accountId: string,
  body: CreateAccountAdjustmentBody,
): Promise<AccountAdjustment> {
  const res = await api.post<AccountAdjustment>(`/vaults/${vaultId}/accounts/${accountId}/adjustments`, body);
  return res.data;
}

export async function updateAccountAdjustment(
  vaultId: string,
  accountId: string,
  adjustmentId: string,
  body: UpdateAccountAdjustmentBody,
): Promise<AccountAdjustment> {
  const res = await api.patch<AccountAdjustment>(
    `/vaults/${vaultId}/accounts/${accountId}/adjustments/${adjustmentId}`,
    body,
  );
  return res.data;
}

export async function deleteAccountAdjustment(vaultId: string, accountId: string, id: string): Promise<void> {
  await api.delete(`/vaults/${vaultId}/accounts/${accountId}/adjustments/${id}`);
}

export async function reconcileAccount(
  vaultId: string,
  accountId: string,
  body: AccountReconcileBody,
): Promise<AccountAdjustment> {
  const res = await api.post<AccountAdjustment>(`/vaults/${vaultId}/accounts/${accountId}/reconcile`, body);
  return res.data;
}

export async function getNetWorthSummary(vaultId: string, req?: RequestOptions): Promise<NetWorthSummary> {
  const res = await api.get<NetWorthSummary>(`/vaults/${vaultId}/accounts/summary`, requestConfig(req));
  return res.data;
}

// ---------------------------------------------------------------------------
// Transaction API helpers
// ---------------------------------------------------------------------------

export async function createTransaction(
  vaultId: string,
  body: CreateTransactionBody & { payeeName?: string },
): Promise<Transaction> {
  const res = await api.post<Transaction>(`/vaults/${vaultId}/transactions`, body);
  return res.data;
}

export async function updateTransaction(
  vaultId: string,
  txnId: string,
  body: UpdateTransactionBody & { payeeName?: string },
): Promise<Transaction> {
  const res = await api.patch<Transaction>(`/vaults/${vaultId}/transactions/${txnId}`, body);
  return res.data;
}

/**
 * One page of the Transactions list. `query` is the page's own serialised
 * query string (period, filters, sort, page), passed through unchanged.
 */
export async function listTransactions(
  vaultId: string,
  query: TransactionListQuery,
  req?: RequestOptions,
): Promise<TransactionListResponse> {
  const res = await api.get<TransactionListResponse>(
    `/vaults/${vaultId}/transactions?${toSearchParams(query).toString()}`,
    requestConfig(req),
  );
  return res.data;
}

export async function deleteTransaction(vaultId: string, txnId: string): Promise<void> {
  await api.delete(`/vaults/${vaultId}/transactions/${txnId}`);
}

// ---------------------------------------------------------------------------
// Tag API helpers (issue #117, docs/design/transactions-tags.md)
// ---------------------------------------------------------------------------

/**
 * Always requests `withUsage=true` — `transactionCount`/`lastUsedAt` are
 * cheap (one GROUP BY, see routes/tags.ts) and every current caller (the
 * entry form's pill ordering, the filter facet, the management view) wants
 * them, so there's no plain-`Tag[]` variant to keep in sync separately.
 */
export async function listTags(vaultId: string, opts?: { q?: string }, req?: RequestOptions): Promise<TagWithUsage[]> {
  const query = new URLSearchParams({ withUsage: "true" });
  if (opts?.q) query.set("q", opts.q);
  const res = await api.get<TagWithUsage[]>(`/vaults/${vaultId}/tags?${query.toString()}`, requestConfig(req));
  return res.data;
}

export async function createTag(vaultId: string, name: string): Promise<Tag> {
  const res = await api.post<Tag>(`/vaults/${vaultId}/tags`, { name });
  return res.data;
}

export async function updateTag(vaultId: string, id: string, name: string): Promise<Tag> {
  const res = await api.patch<Tag>(`/vaults/${vaultId}/tags/${id}`, { name });
  return res.data;
}

export async function deleteTag(vaultId: string, id: string): Promise<void> {
  await api.delete(`/vaults/${vaultId}/tags/${id}`);
}

/** Page-scoped bulk apply/remove (§k.6) — `transactionIds` capped at MAX_BULK_TRANSACTIONS server-side. */
export async function bulkTag(vaultId: string, body: BulkTagBody): Promise<BulkTagResponse> {
  const res = await api.post<BulkTagResponse>(`/vaults/${vaultId}/tags/bulk`, body);
  return res.data;
}

/**
 * Any of a payee, a bucket and a category for several selected transactions,
 * in one write. The server writes each field to the rows whose type can take
 * it, skips ids outside the vault, and returns how many rows it changed in
 * all and per field.
 */
export async function bulkUpdate(vaultId: string, body: BulkUpdateBody): Promise<BulkUpdateResponse> {
  const res = await api.post<BulkUpdateResponse>(`/vaults/${vaultId}/transactions/bulk`, body);
  return res.data;
}

// ---------------------------------------------------------------------------
// Opening balance API helper
// ---------------------------------------------------------------------------

export async function setOpeningBalance(vaultId: string, body: OpeningBalanceBody): Promise<Account> {
  const res = await api.post<Account>(`/vaults/${vaultId}/opening-balance`, body);
  return res.data;
}
