export const VN_TZ = 'Asia/Ho_Chi_Minh';

type DateInput = Date | string | number;

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Calendar parts of an instant as seen in Vietnam time. */
export function vnParts(input: DateInput) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(input)).map((p) => [p.type, p.value]),
  );
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
  };
}

/** "05/10" */
export function formatDayMonth(input: DateInput): string {
  const p = vnParts(input);
  return `${p.day}/${p.month}`;
}

/** "05/10/2026" */
export function formatDate(input: DateInput): string {
  const p = vnParts(input);
  return `${p.day}/${p.month}/${p.year}`;
}

/** "10:42" */
export function formatTime(input: DateInput): string {
  const p = vnParts(input);
  return `${p.hour}:${p.minute}`;
}

/** "10:42 05/10/2026" */
export function formatDateTime(input: DateInput): string {
  return `${formatTime(input)} ${formatDate(input)}`;
}

/** "251006" — used in PO codes and expense tokens. */
export function yymmdd(input: DateInput): string {
  const p = vnParts(input);
  return `${p.year.slice(2)}${p.month}${p.day}`;
}
