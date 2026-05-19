import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { budgetApi } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────
export interface BudgetSummary {
  id: string;
  costCentreId: string;
  costCentreCode: string;
  costCentreName: string;
  departmentName: string;
  fiscalYear: string;
  allocated: number;
  consumed: number;
  supplementaryApproved: number;
  remaining: number;
  utilizationPct: number;
}

export interface BudgetHistoryEntry {
  id: string;
  action: 'ALLOCATE' | 'CONSUME' | 'SUPPLEMENT' | 'ADJUST';
  amount: number;
  balance_after: number;
  note: string | null;
  trip_id: string | null;
  trip_code: string | null;
  created_at: string;
  actor_email: string | null;
  actor_name: string | null;
}

export interface SupplementaryRequest {
  id: string;
  budget_id: string;
  cost_centre_code: string;
  cost_centre_name: string;
  fiscal_year: string;
  amount: number;
  reason: string;
  status: 'PENDING' | 'FINANCE_APPROVED' | 'SUPER_APPROVED' | 'REJECTED';
  finance_note: string | null;
  super_note:   string | null;
  requested_by_name: string;
  created_at: string;
}

// ─── Query Keys ───────────────────────────────────────────────
export const budgetKeys = {
  all:             ['budget'] as const,
  summary:         (costCentreId?: string, fy?: string) =>
    ['budget', 'summary', costCentreId ?? 'me', fy ?? 'current'] as const,
  orgOverview:     (fy?: string) => ['budget', 'org-overview', fy ?? 'current'] as const,
  detail:          (id: string)  => ['budget', 'detail', id] as const,
  history:         (id: string)  => ['budget', 'history', id] as const,
  supplementary:   (status?: string) => ['budget', 'supplementary', status ?? 'all'] as const,
  alerts:          (budgetId?: string) => ['budget', 'alerts', budgetId ?? 'all'] as const,
  alertThresholds: ['budget', 'alert-thresholds'] as const,
};

// ─── Queries ──────────────────────────────────────────────────
export function useBudgetSummary(opts?: { costCentreId?: string; fiscalYear?: string }) {
  return useQuery({
    queryKey: budgetKeys.summary(opts?.costCentreId, opts?.fiscalYear),
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
          totals: { allocated: number; consumed: number; supplementaryApproved: number; remaining: number; overallUtilization: number };
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

export function useSupplementaryRequests(status?: string) {
  return useQuery({
    queryKey: budgetKeys.supplementary(status),
    queryFn: async () => {
      const res = await budgetApi.listSupplementary({ status });
      return res.data.data as SupplementaryRequest[];
    },
  });
}

export function useBudgetAlerts(budgetId?: string) {
  return useQuery({
    queryKey: budgetKeys.alerts(budgetId),
    queryFn: async () => {
      const res = await budgetApi.listAlerts({ budgetId });
      return res.data.data as Array<{
        id: string;
        threshold_pct: number;
        actual_pct: number;
        channel: string;
        fired_at: string;
        cost_centre_code: string;
        acknowledged_at: string | null;
      }>;
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────
export function useRequestSupplementary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { amount: number; reason: string; costCentreId?: string; fiscalYear?: string }) =>
      budgetApi.requestSupplementary(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useApproveSupplementary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'APPROVE' | 'REJECT'; note?: string }) =>
      budgetApi.approveSupplementary(id, { action, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useAdjustBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta, note }: { id: string; delta: number; note: string }) =>
      budgetApi.adjust(id, { delta, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}
