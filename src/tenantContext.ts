import { AsyncLocalStorage } from "async_hooks";

type TenantStore = { companyId: string };

const storage = new AsyncLocalStorage<TenantStore>();

export function runWithCompanyId<T>(companyId: string, fn: () => T): T {
  return storage.run({ companyId }, fn);
}

export function getCompanyId(): string | undefined {
  return storage.getStore()?.companyId;
}

export function setCompanyIdForCurrentAsync(companyId: string) {
  // AsyncLocalStorage is best set via runWithCompanyId().
  // This helper exists to make intent explicit where we *know* we’re already in the right async context.
  const store = storage.getStore();
  if (store) store.companyId = companyId;
}
