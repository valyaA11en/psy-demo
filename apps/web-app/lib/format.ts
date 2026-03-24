const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMoney(amount: number | null | undefined, currency = "RUB") {
  if (typeof amount !== "number") {
    return "price on request";
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "not available";
  }

  return dateFormatter.format(new Date(value));
}

export function formatCompactDateTime(value: string | null | undefined) {
  if (!value) {
    return "not available";
  }

  return shortDateFormatter.format(new Date(value));
}

export function formatDateRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  return `${shortDateFormatter.format(startDate)} - ${new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(endDate)}`;
}

export function humanizeCode(value: string | null | undefined) {
  if (!value) {
    return "not specified";
  }

  return value.replaceAll("_", " ");
}
