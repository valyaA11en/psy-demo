"use client";

import { startTransition, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Specialization } from "@/lib/types";

type FilterBarProps = {
  specializations: Specialization[];
  initialQ?: string;
  initialSpecialization?: string;
  initialLanguage?: string;
  initialSort?: string;
};

export function FilterBar({
  specializations,
  initialQ = "",
  initialSpecialization = "",
  initialLanguage = "",
  initialSort = "rating_desc",
}: FilterBarProps) {
  const router = useRouter();
  const currentParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [specialization, setSpecialization] = useState(initialSpecialization);
  const [language, setLanguage] = useState(initialLanguage);
  const [sort, setSort] = useState(initialSort);

  function applyFilters() {
    const params = new URLSearchParams(currentParams?.toString() ?? "");

    if (q.trim()) {
      params.set("q", q.trim());
    } else {
      params.delete("q");
    }

    if (specialization) {
      params.set("specialization", specialization);
    } else {
      params.delete("specialization");
    }

    if (language.trim()) {
      params.set("language", language.trim());
    } else {
      params.delete("language");
    }

    if (sort) {
      params.set("sort", sort);
    } else {
      params.delete("sort");
    }

    params.delete("page");

    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  }

  function resetFilters() {
    setQ("");
    setSpecialization("");
    setLanguage("");
    setSort("rating_desc");

    startTransition(() => {
      router.push("/");
    });
  }

  return (
    <div className="surface surface-muted">
      <div className="form-grid filters-grid">
        <label className="field">
          <span className="field-label">search</span>
          <input
            className="field-input"
            onChange={(event) => setQ(event.target.value)}
            placeholder="anxiety, burnout, cbt"
            value={q}
          />
        </label>

        <label className="field">
          <span className="field-label">specialization</span>
          <select
            className="field-select"
            onChange={(event) => setSpecialization(event.target.value)}
            value={specialization}
          >
            <option value="">all areas</option>
            {specializations.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">language</span>
          <input
            className="field-input"
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="ru or en"
            value={language}
          />
        </label>

        <label className="field">
          <span className="field-label">sorting</span>
          <select className="field-select" onChange={(event) => setSort(event.target.value)} value={sort}>
            <option value="rating_desc">best rated</option>
            <option value="price_asc">lower price</option>
            <option value="price_desc">higher price</option>
            <option value="experience_desc">more experience</option>
            <option value="latest">latest added</option>
          </select>
        </label>
      </div>

      <div className="inline-actions">
        <button className="button button-primary" onClick={applyFilters} type="button">
          apply filters
        </button>
        <button className="button button-ghost" onClick={resetFilters} type="button">
          reset
        </button>
      </div>
    </div>
  );
}
