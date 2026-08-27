import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

interface ToastState extends ToastOptions {
  message: string;
  key: number;
}

const ToastContext = createContext<{ show: (message: string, opts?: ToastOptions) => void } | null>(
  null,
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() =>
      setToast(null),
    );
  }, [anim]);

  const show = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, key: Date.now(), ...opts });
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      timer.current = setTimeout(dismiss, opts.duration ?? (opts.actionLabel ? 5000 : 3000));
    },
    [anim, dismiss],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          key={toast.key}
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: insets.bottom + 74,
            opacity: anim,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            ],
          }}
        >
          <View className="flex-row items-center gap-3 rounded-[10px] border border-hairline-strong bg-surface py-3 pl-4 pr-3">
            <Text className="flex-1 text-[13px] font-semibold text-ink" numberOfLines={1}>
              {toast.message}
            </Text>
            {toast.actionLabel && (
              <Pressable
                onPress={() => {
                  toast.onAction?.();
                  dismiss();
                }}
                hitSlop={8}
                className="px-2 py-1"
              >
                <Text className="text-[13px] font-extrabold text-accent">{toast.actionLabel}</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
