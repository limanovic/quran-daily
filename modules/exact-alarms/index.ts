import { NativeModule, requireOptionalNativeModule } from 'expo';
import { EventSubscription } from 'expo-modules-core';

type ExactAlarmsEvents = {
  onExactAlarmPermissionChange: (params: { granted: boolean }) => void;
};

declare class ExactAlarmsNativeModule extends NativeModule<ExactAlarmsEvents> {
  canScheduleExactAlarms(): boolean;
  openSettings(): Promise<void>;
}

// Android-only, and optional: absent on iOS by design, and absent in Expo Go,
// which carries no custom native code. A hard require would crash at import
// rather than degrade — and every answer below has a safe default.
const native = requireOptionalNativeModule<ExactAlarmsNativeModule>('ExactAlarms');

/**
 * Whether the OS will honour an exact alarm. False only on Android 12+ where
 * SCHEDULE_EXACT_ALARM has not been granted — there notifications still arrive,
 * batched by the OS, a few minutes off the requested time.
 */
export function canScheduleExactAlarms(): boolean {
  return native?.canScheduleExactAlarms() ?? true;
}

/** Opens the per-app "Alarms & reminders" toggle. No-op off Android. */
export async function openExactAlarmSettings(): Promise<void> {
  await native?.openSettings();
}

/**
 * Fires when the user flips that toggle. The grant happens outside our
 * activity, so this is what lets the schedule be rebuilt without waiting for
 * the next app launch.
 */
export function addExactAlarmPermissionListener(
  listener: (granted: boolean) => void,
): EventSubscription | null {
  return (
    native?.addListener('onExactAlarmPermissionChange', ({ granted }) => listener(granted)) ?? null
  );
}
