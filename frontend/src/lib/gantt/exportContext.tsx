import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface GanttExportHandlers {
  excel: () => Promise<void>;
  pdf: () => Promise<void>;
}

interface GanttExportContextValue {
  handlers: GanttExportHandlers | null;
  register: (h: GanttExportHandlers | null) => void;
}

const GanttExportContext = createContext<GanttExportContextValue | null>(null);

export function GanttExportProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<GanttExportHandlers | null>(null);
  const register = useCallback((h: GanttExportHandlers | null) => {
    setHandlers(h);
  }, []);
  const value = useMemo<GanttExportContextValue>(
    () => ({ handlers, register }),
    [handlers, register],
  );
  return (
    <GanttExportContext.Provider value={value}>{children}</GanttExportContext.Provider>
  );
}

export function useGanttExport(): GanttExportContextValue {
  const ctx = useContext(GanttExportContext);
  if (!ctx) {
    // Outside the provider — return a no-op shape so consumers can render
    // safely (the Export section uses `handlers === null` as its hide gate).
    return { handlers: null, register: () => {} };
  }
  return ctx;
}
