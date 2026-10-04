import { createContext, useContext } from "react";
import type { SystemStatus } from "../../types";

interface ShellContextValue {
  openCopilot: () => void;
  status: SystemStatus | null;
  reloadStatus: () => Promise<void>;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside AppShell");
  return value;
}
