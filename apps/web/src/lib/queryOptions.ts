import { getProviders } from "@/lib/api/auth";
import { getMe } from "@/lib/api/users";
import { queryKeys } from "@/lib/queryKeys";
import { queryOptions } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// The options for every read, built once: the key, the fetch and how long
// the result stays fresh. Components call `useQuery(meQuery())` and never
// assemble a key or a fetch themselves.
// ---------------------------------------------------------------------------

/** The signed-in user. Fresh until an account change invalidates it. */
export function meQuery() {
  return queryOptions({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) => getMe({ signal }),
    staleTime: Infinity,
  });
}

/** Which sign-in providers this deployment offers. It changes only with a deploy. */
export function providersQuery() {
  return queryOptions({
    queryKey: queryKeys.providers(),
    queryFn: ({ signal }) => getProviders({ signal }),
    staleTime: Infinity,
  });
}
