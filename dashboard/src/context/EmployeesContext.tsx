import { createContext, useContext, type ReactNode } from "react";
import { usePolling } from "../hooks/useApi";
import type { Employee } from "../types";

interface EmployeesCtx {
  employees: Employee[] | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<EmployeesCtx>({ employees: null, loading: true, refresh: async () => {} });

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const { data, loading, refresh } = usePolling<Employee[]>("/api/employees", 10000);
  return <Ctx.Provider value={{ employees: data, loading, refresh }}>{children}</Ctx.Provider>;
}

export function useEmployees() {
  return useContext(Ctx);
}
