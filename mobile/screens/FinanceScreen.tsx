import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, StyleSheet, RefreshControl, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme, spacing } from "../lib/theme";
import { getApi } from "../lib/api";
import Icon from "react-native-vector-icons/Ionicons";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentUsage {
  id: string; name: string; role: string; initials: string; color: string;
  turns: number; inputTokens: number; outputTokens: number; totalTokens: number;
  costUsd: number; model: string; lastActivity: string;
}

interface Totals {
  totalCostUsd: number; totalTokens: number; totalInputTokens: number;
  totalOutputTokens: number; totalTurns: number; sessionStart: string;
}

interface LimitStatus {
  dailySpend: number; monthlySpend: number;
  dailyLimit?: number; monthlyLimit?: number;
  dailyPct: number; monthlyPct: number;
  exceeded: boolean; warning: boolean; enabled: boolean;
}

interface FinanceData {
  totals: Totals;
  agents: AgentUsage[];
  budget: { org: LimitStatus & { alertThreshold: number }; departments: Record<string, LimitStatus> };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  const d = n > 0 && n < 1 ? 4 : 2;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtNum(n: number): string { return n.toLocaleString("en-US"); }
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}
function timeSince(iso: string): string {
  if (!iso) return "-";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function sessionDuration(iso: string): string {
  if (!iso) return "-";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, exceeded }: { pct: number; exceeded: boolean }) {
  const { colors } = useTheme();
  const clamp = Math.min(pct, 1);
  const color = exceeded ? colors.red : pct >= 0.8 ? colors.orange : pct >= 0.5 ? colors.yellow : colors.green;

  const ps = useMemo(() => StyleSheet.create({
    container: { flexDirection: "row", alignItems: "center", gap: 8 },
    track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bgTertiary, overflow: "hidden" },
    fill: { height: "100%", borderRadius: 3 },
    label: { fontSize: 10, color: colors.textMuted, width: 50, textAlign: "right" },
  }), [colors]);

  return (
    <View style={ps.container}>
      <View style={ps.track}>
        <View style={[ps.fill, { width: `${clamp * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={[ps.label, exceeded && { color: colors.red, fontWeight: "700" }]}>
        {exceeded ? "EXCEEDED" : `${(pct * 100).toFixed(0)}%`}
      </Text>
    </View>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function FinanceScreen() {
  const { colors } = useTheme();
  const [data, setData] = useState<FinanceData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getApi<FinanceData>("/api/m/finance");
      setData(d);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totals = data?.totals;
  const agents = data?.agents ?? [];
  const budget = data?.budget;
  const maxTokens = Math.max(1, ...agents.map(a => a.totalTokens));

  // Sort by cost descending
  const sorted = [...agents].sort((a, b) => b.costUsd - a.costUsd);

  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    title: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
    sessionLabel: { fontSize: 11, color: colors.textMuted },

    // Summary cards
    summaryRow: {
      flexDirection: "row", gap: 8,
      paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
    },
    summaryCard: {
      flex: 1, backgroundColor: colors.bgCard, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    },
    summaryLabel: { fontSize: 10, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
    summaryValue: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, marginTop: 4 },
    summarySubtext: { fontSize: 9, color: colors.textDim, marginTop: 2 },

    // Budget
    section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
    sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textSecondary, marginBottom: 10 },
    budgetCard: {
      backgroundColor: colors.bgCard, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, padding: spacing.md,
      gap: 12,
    },
    budgetRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    budgetLabel: { fontSize: 11, fontWeight: "600", color: colors.textMuted, width: 50 },
    budgetAmount: { fontSize: 10, color: colors.textDim, width: 90, textAlign: "right" },

    // Dept budgets
    deptRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: colors.bgCard, borderRadius: 10,
      borderWidth: 1, borderColor: colors.border,
      padding: spacing.sm, paddingHorizontal: spacing.md, marginBottom: 6,
    },
    deptName: { fontSize: 12, fontWeight: "600", color: colors.textPrimary, width: 90 },

    // Agent cards
    agentCard: {
      backgroundColor: colors.bgCard, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border,
      padding: spacing.md, marginBottom: 8,
    },
    agentTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    avatar: {
      width: 32, height: 32, borderRadius: 8,
      backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
    },
    avatarText: { fontSize: 11, fontWeight: "700", color: colors.textPrimary },
    agentName: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    agentRole: { fontSize: 11, color: colors.textMuted },
    costBadge: {
      backgroundColor: colors.bgTertiary, paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 8,
    },
    costText: { fontSize: 13, fontWeight: "700", color: colors.green },

    // Token bar
    tokenBar: {
      height: 4, borderRadius: 2, backgroundColor: colors.bgTertiary,
      marginTop: 10, overflow: "hidden",
    },
    tokenFill: { height: "100%", borderRadius: 2, backgroundColor: colors.textDim },

    // Stats row
    agentStats: {
      flexDirection: "row", marginTop: 10, gap: 4,
    },
    statItem: { flex: 1, alignItems: "center" },
    statLabel: { fontSize: 9, fontWeight: "600", color: colors.textDim, textTransform: "uppercase", letterSpacing: 0.3 },
    statValue: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 2 },

    // Model
    modelText: { fontSize: 9, color: colors.textDim, marginTop: 6, fontFamily: "monospace" },

    // Empty
    empty: { alignItems: "center", paddingTop: 40 },
    emptyText: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  }), [colors]);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.title}>Finance</Text>
        {totals && (
          <Text style={s.sessionLabel}>Session: {sessionDuration(totals.sessionStart)}</Text>
        )}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── Summary Cards ──────────────────────────── */}
        {totals && (
          <View style={s.summaryRow}>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>Total Spent</Text>
              <Text style={s.summaryValue}>{fmtUsd(totals.totalCostUsd)}</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>Tokens</Text>
              <Text style={s.summaryValue}>{fmtTokens(totals.totalTokens)}</Text>
              <Text style={s.summarySubtext}>
                {fmtTokens(totals.totalInputTokens)} in / {fmtTokens(totals.totalOutputTokens)} out
              </Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>LLM Turns</Text>
              <Text style={s.summaryValue}>{fmtNum(totals.totalTurns)}</Text>
            </View>
          </View>
        )}

        {/* ── Org Budget ─────────────────────────────── */}
        {budget?.org?.enabled && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Organization Budget</Text>
            <View style={s.budgetCard}>
              {budget.org.dailyLimit != null && (
                <View style={s.budgetRow}>
                  <Text style={s.budgetLabel}>Daily</Text>
                  <View style={{ flex: 1 }}>
                    <ProgressBar pct={budget.org.dailyPct} exceeded={budget.org.exceeded} />
                  </View>
                  <Text style={s.budgetAmount}>
                    {fmtUsd(budget.org.dailySpend)} / {fmtUsd(budget.org.dailyLimit)}
                  </Text>
                </View>
              )}
              {budget.org.monthlyLimit != null && (
                <View style={s.budgetRow}>
                  <Text style={s.budgetLabel}>Monthly</Text>
                  <View style={{ flex: 1 }}>
                    <ProgressBar pct={budget.org.monthlyPct} exceeded={budget.org.exceeded} />
                  </View>
                  <Text style={s.budgetAmount}>
                    {fmtUsd(budget.org.monthlySpend)} / {fmtUsd(budget.org.monthlyLimit)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Department Budgets ──────────────────────── */}
        {budget?.departments && Object.keys(budget.departments).some(k => budget.departments[k].enabled) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Department Budgets</Text>
            {Object.entries(budget.departments)
              .filter(([, v]) => v.enabled)
              .map(([dept, st]) => (
                <View key={dept} style={s.deptRow}>
                  <Text style={s.deptName}>{dept}</Text>
                  <View style={{ flex: 1 }}>
                    <ProgressBar pct={st.dailyPct || st.monthlyPct} exceeded={st.exceeded} />
                  </View>
                  {st.exceeded && <Icon name="warning-outline" size={14} color={colors.red} />}
                  {st.warning && !st.exceeded && <Icon name="alert-outline" size={14} color={colors.orange} />}
                </View>
              ))}
          </View>
        )}

        {/* ── Agent Usage ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Agent Usage</Text>
          {sorted.length === 0 && (
            <View style={s.empty}>
              <Icon name="analytics-outline" size={36} color={colors.textDim} />
              <Text style={s.emptyText}>No usage data yet</Text>
            </View>
          )}
          {sorted.map(agent => {
            const barPct = Math.max(2, (agent.totalTokens / maxTokens) * 100);
            return (
              <View key={agent.id} style={s.agentCard}>
                <View style={s.agentTop}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{agent.initials || agent.id.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.agentName}>{agent.name}</Text>
                    <Text style={s.agentRole}>{agent.role}</Text>
                  </View>
                  <View style={s.costBadge}>
                    <Text style={s.costText}>{fmtUsd(agent.costUsd)}</Text>
                  </View>
                </View>

                {/* Token bar */}
                <View style={s.tokenBar}>
                  <View style={[s.tokenFill, { width: `${barPct}%` }]} />
                </View>

                <View style={s.agentStats}>
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Turns</Text>
                    <Text style={s.statValue}>{fmtNum(agent.turns)}</Text>
                  </View>
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Input</Text>
                    <Text style={s.statValue}>{fmtTokens(agent.inputTokens)}</Text>
                  </View>
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Output</Text>
                    <Text style={s.statValue}>{fmtTokens(agent.outputTokens)}</Text>
                  </View>
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Last</Text>
                    <Text style={s.statValue}>{timeSince(agent.lastActivity)}</Text>
                  </View>
                </View>

                {agent.model ? (
                  <Text style={s.modelText}>{agent.model}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
