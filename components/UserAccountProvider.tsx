import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "@/database/supabase";
import { ensureProfileAndMembershipExists } from "@/utils/profileReadiness";

type MembershipPlan = "free" | "premium";
type MembershipStatus = "active" | "inactive" | "cancelled" | "past_due" | "trialing";

type CachedUserAccount = {
  userId: string;
  email: string | null;
  membershipPlan: MembershipPlan;
  membershipStatus: MembershipStatus;
  isPremium: boolean;
  updatedAt: string;
};

type UserAccountContextValue = {
  account: CachedUserAccount | null;
  hydrated: boolean;
  refreshing: boolean;
  isPremium: boolean;
  refreshAccount: (uidOverride?: string | null, emailOverride?: string | null) => Promise<CachedUserAccount | null>;
};

const ACCOUNT_CACHE_KEY = "carmeet:user-account:v1";

const UserAccountContext = createContext<UserAccountContextValue | null>(null);

function normalizeCachedAccount(value: string | null): CachedUserAccount | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<CachedUserAccount>;
    if (!parsed.userId) return null;

    const membershipPlan = parsed.membershipPlan === "premium" ? "premium" : "free";
    const membershipStatus = (parsed.membershipStatus ?? "inactive") as MembershipStatus;

    return {
      userId: parsed.userId,
      email: parsed.email ?? null,
      membershipPlan,
      membershipStatus,
      isPremium: membershipPlan === "premium" && membershipStatus === "active",
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function UserAccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<CachedUserAccount | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const persistAccount = useCallback(async (next: CachedUserAccount | null) => {
    setAccount(next);

    if (!next) {
      await AsyncStorage.removeItem(ACCOUNT_CACHE_KEY);
      return;
    }

    await AsyncStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(next));
  }, []);

  const refreshAccount = useCallback(
    async (uidOverride?: string | null, emailOverride?: string | null) => {
      setRefreshing(true);
      try {
        let uid = uidOverride ?? null;
        let email = emailOverride ?? null;

        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data.user?.id ?? null;
          email = data.user?.email ?? null;
        }

        if (!uid) {
          await persistAccount(null);
          return null;
        }

        const ensured = await ensureProfileAndMembershipExists(uid, email);
        const membership = ensured.membership;
        const membershipPlan = membership?.plan ?? "free";
        const membershipStatus = membership?.status ?? "inactive";
        const next: CachedUserAccount = {
          userId: uid,
          email,
          membershipPlan,
          membershipStatus,
          isPremium: membershipPlan === "premium" && membershipStatus === "active",
          updatedAt: new Date().toISOString(),
        };

        await persistAccount(next);
        return next;
      } finally {
        setRefreshing(false);
      }
    },
    [persistAccount]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [cachedValue, authResult] = await Promise.all([
        AsyncStorage.getItem(ACCOUNT_CACHE_KEY),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;

      const user = authResult.data.user;
      const cached = normalizeCachedAccount(cachedValue);

      if (user?.id && cached?.userId === user.id) {
        setAccount(cached);
      } else if (!user?.id) {
        await persistAccount(null);
      } else {
        setAccount({
          userId: user.id,
          email: user.email ?? null,
          membershipPlan: "free",
          membershipStatus: "inactive",
          isPremium: false,
          updatedAt: new Date(0).toISOString(),
        });
      }

      setHydrated(true);

      if (user?.id) {
        void refreshAccount(user.id, user.email ?? null);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;

      if (!user?.id) {
        setHydrated(true);
        void persistAccount(null);
        return;
      }

      setHydrated(true);
      void refreshAccount(user.id, user.email ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [persistAccount, refreshAccount]);

  const value = useMemo(
    () => ({
      account,
      hydrated,
      refreshing,
      isPremium: account?.isPremium ?? false,
      refreshAccount,
    }),
    [account, hydrated, refreshing, refreshAccount]
  );

  return <UserAccountContext.Provider value={value}>{children}</UserAccountContext.Provider>;
}

export function useUserAccount() {
  const context = useContext(UserAccountContext);
  if (!context) throw new Error("useUserAccount must be used within UserAccountProvider");
  return context;
}
