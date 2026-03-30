export type CrisisSupportResource = {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
  href?: string;
  availability?: string;
};

export type CrisisSignalDetection = {
  suggested: boolean;
  matchedMarkers: string[];
  fingerprint: string;
};

const crisisMarkers = [
  "не хочу жить",
  "не вижу смысла жить",
  "хочу умереть",
  "лучше бы меня не было",
  "покончить с собой",
  "совершить суицид",
  "суицид",
  "убить себя",
  "навредить себе",
  "самоповреж",
  "self-harm",
  "kill myself",
  "end my life",
  "suicide",
];

const fallbackResources: CrisisSupportResource[] = [
  {
    id: "emergency",
    title: "Экстренные службы",
    description:
      "Если есть непосредственная опасность для вашей жизни или жизни другого человека, немедленно обращайтесь в экстренные службы вашего региона.",
    actionLabel: "Позвонить 112",
    href: "tel:112",
    availability: "Круглосуточно",
  },
  {
    id: "trusted-person",
    title: "Близкий человек рядом",
    description:
      "Если оставаться одному сейчас тяжело, свяжитесь с человеком, которому вы доверяете, и попросите не оставлять вас без поддержки.",
    availability: "Как можно скорее",
  },
  {
    id: "regional-resource",
    title: "Локальная кризисная линия",
    description:
      "Настройте в окружении проекта актуальный номер или сайт кризисной помощи для страны и региона вашего деплоя.",
    actionLabel: "Открыть список ресурсов",
    href: "https://example.com/crisis-support",
  },
];

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sanitizeResource(input: unknown, index: number): CrisisSupportResource | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";

  if (!title || !description) {
    return null;
  }

  const resource: CrisisSupportResource = {
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `resource-${index + 1}`,
    title,
    description,
  };

  if (typeof candidate.actionLabel === "string" && candidate.actionLabel.trim()) {
    resource.actionLabel = candidate.actionLabel.trim();
  }

  if (typeof candidate.href === "string" && candidate.href.trim()) {
    resource.href = candidate.href.trim();
  }

  if (typeof candidate.availability === "string" && candidate.availability.trim()) {
    resource.availability = candidate.availability.trim();
  }

  return resource;
}

export function getCrisisSupportResources() {
  const raw = process.env.NEXT_PUBLIC_CRISIS_SUPPORT_RESOURCES_JSON;

  if (!raw) {
    return fallbackResources;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return fallbackResources;
    }

    const resources = parsed
      .map((item, index) => sanitizeResource(item, index))
      .filter((item): item is CrisisSupportResource => Boolean(item));

    return resources.length > 0 ? resources : fallbackResources;
  } catch {
    return fallbackResources;
  }
}

export function detectCrisisSignals(value: string): CrisisSignalDetection {
  const normalized = normalizeText(value);

  if (!normalized) {
    return {
      suggested: false,
      matchedMarkers: [],
      fingerprint: "",
    };
  }

  const matchedMarkers = crisisMarkers.filter((marker) => normalized.includes(marker));

  return {
    suggested: matchedMarkers.length > 0,
    matchedMarkers,
    fingerprint: normalized,
  };
}
