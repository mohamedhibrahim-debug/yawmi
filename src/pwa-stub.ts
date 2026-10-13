// Used only by the "artifact" build (a hosted preview page), where service workers
// are not available. Mirrors the shape of `virtual:pwa-register/preact`.
export function useRegisterSW(_opts?: unknown) {
  void _opts;
  return {
    needRefresh: [false, () => undefined] as const,
    offlineReady: [false, () => undefined] as const,
    updateServiceWorker: async (_reload?: boolean) => undefined
  };
}
