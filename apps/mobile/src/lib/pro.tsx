import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

import { useAuth } from "@/lib/auth";

// The entitlement configured in the RevenueCat dashboard. Anything gated behind Pro
// checks entitlements.active[ENTITLEMENT_ID].
export const ENTITLEMENT_ID = "thatfridge_pro";

const RC_IOS_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY;

// react-native-purchases is a native module — it can't run in Expo Go or (for our
// purposes) on web. There, or with no key configured, the whole thing no-ops:
// `available` is false and `isPro` is false.
const AVAILABLE =
  Platform.OS !== "web" && Constants.appOwnership !== "expo" && !!RC_IOS_KEY;

interface ProContextValue {
  /** IAPs are usable in this build (dev build + key present). */
  available: boolean;
  /** Initial customer-info fetch has completed. */
  ready: boolean;
  isPro: boolean;
  /** All packages in the current offering (e.g. monthly, yearly). */
  packages: PurchasesPackage[];
  /**
   * Show the RevenueCat paywall only if the user isn't already entitled. Use this to
   * gate an action ("go Pro to continue"). Returns true once the user is entitled.
   * The dedicated /paywall screen renders <RevenueCatUI.Paywall> directly instead.
   */
  presentPaywallIfNeeded: () => Promise<boolean>;
  /** Buy a specific package (custom fallback paywall). */
  purchase: (pkg: PurchasesPackage) => Promise<void>;
  restore: () => Promise<void>;
  /** RevenueCat Customer Center — manage / cancel / request refund. */
  openCustomerCenter: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ProContext = createContext<ProContextValue | null>(null);

const hasPro = (info: CustomerInfo | null | undefined): boolean =>
  !!info?.entitlements.active[ENTITLEMENT_ID];

export function ProProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(!AVAILABLE);
  const [isPro, setIsPro] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const isProRef = useRef(false);
  useEffect(() => {
    isProRef.current = isPro;
  }, [isPro]);

  const loadOffering = useCallback(async () => {
    try {
      const offerings = await Purchases.getOfferings();
      setPackages(offerings.current?.availablePackages ?? []);
    } catch {
      setPackages([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!AVAILABLE) return;
    try {
      setIsPro(hasPro(await Purchases.getCustomerInfo()));
    } catch {
      /* keep last known */
    }
  }, []);

  useEffect(() => {
    if (!AVAILABLE) return;
    let listener: ((info: CustomerInfo) => void) | undefined;
    (async () => {
      try {
        if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.WARN);
        Purchases.configure({ apiKey: RC_IOS_KEY! });
        listener = (info) => setIsPro(hasPro(info));
        Purchases.addCustomerInfoUpdateListener(listener);
        setIsPro(hasPro(await Purchases.getCustomerInfo()));
        await loadOffering();
      } catch {
        /* paywall/gate will show a graceful state */
      } finally {
        setReady(true);
      }
    })();
    return () => {
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [loadOffering]);

  // Tie the RevenueCat identity to the app account so entitlements follow the user
  // across devices and reinstalls.
  useEffect(() => {
    if (!AVAILABLE || !user?.id) return;
    Purchases.logIn(user.id)
      .then(({ customerInfo }) => setIsPro(hasPro(customerInfo)))
      .catch(() => {});
  }, [user?.id]);

  const presentPaywallIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!AVAILABLE) return false;
    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: ENTITLEMENT_ID,
        displayCloseButton: true,
      });
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await refresh();
        return true;
      }
    } catch {
      /* fall through */
    }
    return isProRef.current;
  }, [refresh]);

  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    setIsPro(hasPro(customerInfo));
  }, []);

  const restore = useCallback(async () => {
    setIsPro(hasPro(await Purchases.restorePurchases()));
  }, []);

  const openCustomerCenter = useCallback(async () => {
    if (!AVAILABLE) return;
    await RevenueCatUI.presentCustomerCenter();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      available: AVAILABLE,
      ready,
      isPro,
      packages,
      presentPaywallIfNeeded,
      purchase,
      restore,
      openCustomerCenter,
      refresh,
    }),
    [ready, isPro, packages, presentPaywallIfNeeded, purchase, restore, openCustomerCenter, refresh],
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro(): ProContextValue {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error("usePro must be used within <ProProvider>");
  return ctx;
}
