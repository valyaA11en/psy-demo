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

export function formatFileSize(sizeBytes: number | null | undefined) {
  if (typeof sizeBytes !== "number" || Number.isNaN(sizeBytes) || sizeBytes < 0) {
    return "неизвестный размер";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} Б`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} КБ`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} МБ`;
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
    open: "открыт",
    held: "в резерве",
    booked: "забронирован",
    blocked: "заблокирован",
    cancelled: "отменен",
    scheduled: "запланирована",
    completed: "завершена",
    new: "новая",
    in_review: "в работе",
    resolved: "решена",
    pending: "ожидает",
    succeeded: "успешно",
    failed: "ошибка",
    refunded: "возврат",
    draft: "черновик",
    pending_review: "на модерации",
    approved: "одобрен",
    rejected: "отклонен",
    published: "опубликован",
    hidden: "скрыт",
    online: "онлайн",
    chat: "чат",
    phone: "телефон",
    offline: "офлайн",
    idle: "ожидание",
    connecting: "подключение",
    connected: "подключено",
    consultation: "консультация",
    payment: "платеж",
    video_session: "видеосессия",
    booking: "бронирование",
    in_app: "в приложении",
    email: "эл. почта",
    telegram: "telegram",
    processing: "обрабатывается",
    sent: "доставлено",
    paid: "оплачен",
    uploaded: "загружен",
    deleted: "удален",
    private: "приватный",
    public: "публичный",
    payment_required: "требуется оплата",
    mock_video: "тестовый провайдер",
    livekit: "livekit",
    ru: "русский",
    en: "английский",
    "booking.created": "создано бронирование",
    "booking.cancelled": "бронирование отменено",
    "booking.completed": "консультация завершена",
    "payment.created": "создан платеж",
    "payment.succeeded": "платеж подтвержден",
    "payment.failed": "платеж отклонен",
    "payment.cancelled": "платеж отменен",
    "payment.updated": "обновлен платеж",
    "review.created": "создан отзыв",
    "complaint.created": "создана жалоба",
    "video.session_ready": "видеосессия готова",
    service_quality: "качество услуги",
    no_show: "неявка",
    refund_request: "запрос возврата",
    privacy: "приватность",
    abuse: "некорректное поведение",
    billing: "оплата",
    other: "другое",
    psychologist_verification_document: "документ для верификации",
    psychologist_certificate: "сертификат",
    psychologist_diploma: "диплом",
    psychologist_additional_document: "дополнительный документ",
    psychologist_public_photo: "публичное фото",
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
