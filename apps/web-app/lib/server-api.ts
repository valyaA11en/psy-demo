import type {
  ApiEnvelope,
  ApiErrorPayload,
  CatalogResponse,
  PublicPsychologist,
  PublicSessionPackageOffersResponse,
  PublicReviewListResponse,
  PublicSlotsResponse,
  Specialization,
} from "@/lib/types";

function serverApiBaseUrl() {
  return (
    process.env.API_INTERNAL_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:4000/api/v1"
  );
}

async function parseResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorPayload | null;

  if (!response.ok) {
    const message =
      payload && "error" in payload && payload.error?.message
        ? payload.error.message
        : "Запрос завершился ошибкой";
    throw new Error(message);
  }

  if (!payload || !("data" in payload)) {
    throw new Error("API вернул неожиданный ответ");
  }

  return payload.data;
}

async function apiServerGet<T>(path: string) {
  const response = await fetch(`${serverApiBaseUrl()}${path}`, {
    cache: "no-store",
  });

  return parseResponse<T>(response);
}

export async function getCatalogPsychologists(query = "") {
  return apiServerGet<CatalogResponse>(`/catalog/psychologists${query}`);
}

export async function getSpecializations() {
  return apiServerGet<Specialization[]>("/catalog/specializations");
}

export async function getPsychologist(slug: string) {
  return apiServerGet<PublicPsychologist>(`/catalog/psychologists/${slug}`);
}

export async function getPsychologistSlots(slug: string, query = "") {
  return apiServerGet<PublicSlotsResponse>(`/availability/psychologists/${slug}/slots${query}`);
}

export async function getPsychologistReviews(slug: string, query = "") {
  return apiServerGet<PublicReviewListResponse>(`/reviews/psychologists/${slug}${query}`);
}

export async function getPsychologistSessionPackageOffers(slug: string) {
  return apiServerGet<PublicSessionPackageOffersResponse>(`/session-packages/offers/psychologists/${slug}`);
}
