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
    return "цена по запросу";
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "недоступно";
  }

  return dateFormatter.format(new Date(value));
}

export function formatCompactDateTime(value: string | null | undefined) {
  if (!value) {
    return "недоступно";
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
    return "не указано";
  }
  const dictionary: Record<string, string> = {
    client: "клиент",
    psychologist: "психолог",
    admin: "администратор",
    superadmin: "суперадмин",
    open: "свободен",
    held: "в резерве",
    booked: "забронирован",
    blocked: "заблокирован",
    cancelled: "отменён",
    scheduled: "запланирована",
    completed: "завершена",
    pending: "ожидает",
    succeeded: "успешно",
    failed: "ошибка",
    refunded: "возврат",
    draft: "черновик",
    pending_review: "на модерации",
    approved: "одобрен",
    rejected: "отклонён",
    online: "онлайн",
    offline: "офлайн",
    idle: "ожидание",
    connecting: "подключение",
    connected: "подключено",
    consultation: "консультация",
    payment: "платёж",
    video_session: "видеосессия",
    booking: "бронирование",
    in_app: "в приложении",
    email: "эл. почта",
    telegram: "telegram",
    processing: "обрабатывается",
    sent: "доставлено",
    paid: "оплачено",
    payment_required: "требуется оплата",
    mock_video: "тестовый провайдер",
    ru: "русский",
    en: "английский",
    "booking.created": "создано бронирование",
    "booking.cancelled": "бронирование отменено",
    "booking.completed": "консультация завершена",
    "payment.created": "создан платёж",
    "payment.succeeded": "платёж подтверждён",
    "payment.failed": "платёж отклонён",
    "payment.cancelled": "платёж отменён",
    "payment.updated": "обновлён платёж",
    "video.session_ready": "видеосессия готова",
  };

  Object.assign(dictionary, {
    manual: "вручную",
    generated: "автогенерация",
    monday: "понедельник",
    tuesday: "вторник",
    wednesday: "среда",
    thursday: "четверг",
    friday: "пятница",
    saturday: "суббота",
    sunday: "воскресенье",
  });

  return dictionary[value] ?? value.replaceAll("_", " ").replaceAll(".", " ");
}
