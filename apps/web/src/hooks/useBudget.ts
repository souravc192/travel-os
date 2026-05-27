import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { budgetApi } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────
export interface BudgetSummary {
  id: string;
  departmentId: string;
  departmentName: string;
  fiscalYear: string;
  allocatedAnnual: number;
  consumed: number;
  supplementaryApproved: number;
  remaining: number;
  utilizationPct: number;
}

export interface BudgetHistoryEntry {
  id: string;
  action: 'ALLOCATE' | 'CONSUME' | 'SUPPLEMENT' | 'ADJUST' | 'REFUND';
  amount: number;
  balance_after: number;
  note: string | null;
  travel_request_id: string | null;
  request_code: string | null;
  booking_id: string | null;
  booking_vendor: string | null;
  booking_type: string | null;
  booking_status: string | null;
  created_at: string;
  actor_email: string | null;
  actor_name: string | null;
}

export interface BudgetAdditionRequest {
  id: string;
  department_budget_id: string;
  department_id: string;
  department_name: string;
  fiscal_year: string;
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decision_note: string | null;
  requested_by_name: string;
  requested_by_email: string;
  created_at: string;
}

// ─── Query Keys ───────────────────────────────────────────────
export const budgetKeys = {
  all:              ['budget'] as const,
  summary:          (deptId?: string, fy?: string) =>
    ['budget', 'summary', deptId ?? 'me', fy ?? 'current'] as const,
  orgOverview:      (fy?: string) => ['budget', 'org-overview', fy ?? 'current'] as const,
  detail:           (id: string)  => ['budget', 'detail', id] as const,
  history:          (id: string)  => ['budget', 'history', id] as const,
  additions:        (status?: string) => ['budget', 'additions', status ?? 'all'] as const,
};

// ─── Queries ──────────────────────────────────────────────────
export function useBudgetSummary(opts?: { departmentId?: string; fiscalYear?: string }) {
  return useQuery({
    queryKey: budgetKeys.summary(opts?.departmentId, opts?.fiscalYear),
    queryFn: async () => {
      const res = await budgetApi.summary(opts);
      return res.data.data as BudgetSummary | null;
    },
  });
}

export function useOrgOverview(fiscalYear?: string) {
  return useQuery({
    queryKey: budgetKeys.orgOverview(fiscalYear),
    queryFn: async () => {
      const res = await budgetApi.orgOverview({ fiscalYear });
      return res.data as {
        success: boolean;
        data: BudgetSummary[];
        meta: {
          fiscalYear: string;
          totals: { allocatedAnnual: number; consumed: number; supplementaryApproved: number; remaining: number; overallUtilization: number };
          count: number;
        };
      };
    },
  });
}

export function useBudgetHistory(budgetId: string | undefined) {
  return useQuery({
    queryKey: budgetKeys.history(budgetId ?? ''),
    enabled:  Boolean(budgetId),
    queryFn: async () => {
      const res = await budgetApi.history(budgetId!);
      return res.data.data as BudgetHistoryEntry[];
    },
  });
}

export function useAdditionRequests(status?: string) {
  return useQuery({
    queryKey: budgetKeys.additions(status),
    queryFn: async () => {
      const res = await budgetApi.listAdditions({ status });
      return res.data.data as BudgetAdditionRequest[];
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────
export function useRequestAddition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { departmentBudgetId: string; amount: number; reason: string }) =>
      budgetApi.requestAddition(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget'] }),
  });
}

export function useDecideAddition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'APPROVE' | 'REJECT'; note?: string }) =>
      budgetApi.decideAddition(id, { action, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget'] }),
  });
}

export function useAdjustBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta, note }: { id: string; delta: number; note: string }) =>
      budgetApi.adjust(id, { delta, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget'] }),
  });
}
