/** The device's resolved IANA timezone, e.g. "Asia/Kuala_Lumpur" - used to default a schedule
 *  trigger's timezone before the user confirms/edits it in Kitchen Lab's review screen. */
export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
