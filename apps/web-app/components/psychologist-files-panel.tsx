"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { formatCompactDateTime, formatFileSize, humanizeCode } from "@/lib/format";
import type { PrivateFileRecord } from "@/lib/types";

type Props = {
  files: PrivateFileRecord[];
  onDelete: (fileId: string) => Promise<void>;
  onDownload: (fileId: string) => Promise<void>;
  onUpload: (purpose: string, file: File) => Promise<void>;
};

const purposeOptions = [
  "psychologist_verification_document",
  "psychologist_certificate",
  "psychologist_diploma",
  "psychologist_additional_document",
  "psychologist_public_photo",
] as const;

const purposeHints: Record<(typeof purposeOptions)[number], string> = {
  psychologist_verification_document: "PDF, JPG или PNG до 10 МБ. Используется для модерации.",
  psychologist_certificate: "PDF, JPG или PNG до 10 МБ. Подходит для сертификатов повышения квалификации.",
  psychologist_diploma: "PDF, JPG или PNG до 10 МБ. Основной документ об образовании.",
  psychologist_additional_document: "PDF, JPG или PNG до 10 МБ. Любой дополнительный подтверждающий файл.",
  psychologist_public_photo: "JPG, PNG или WEBP до 5 МБ. Может использоваться как публичное фото профиля.",
};

function acceptForPurpose(purpose: string) {
  if (purpose === "psychologist_public_photo") {
    return ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
  }

  return ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
}

export function PsychologistFilesPanel({ files, onDelete, onDownload, onUpload }: Props) {
  const [purpose, setPurpose] = useState<string>("psychologist_diploma");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const activeHint = useMemo(
    () => purposeHints[purpose as keyof typeof purposeHints] ?? "",
    [purpose],
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setError("Сначала выберите файл");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      await onUpload(purpose, selectedFile);
      setSelectedFile(null);
      setInputKey((current) => current + 1);
      setSuccess("Файл загружен и сохранен в приватное хранилище");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось загрузить файл");
    } finally {
      setPending(false);
    }
  }

  async function handleDownload(fileId: string) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      await onDownload(fileId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось получить ссылку на скачивание");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(fileId: string) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      await onDelete(fileId);
      setSuccess("Файл удален");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось удалить файл");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Документы</p>
          <h3 className="card-title">Файлы психолога</h3>
          <p className="section-text">
            Загрузка идет через временные signed URL. Приватные документы не выводятся в каталоге и доступны только владельцу.
          </p>
        </div>
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        <div className="form-grid two-columns">
          <label className="field">
            <span className="field-label">Тип файла</span>
            <select
              className="field-select"
              disabled={pending}
              onChange={(event) => setPurpose(event.target.value)}
              value={purpose}
            >
              {purposeOptions.map((option) => (
                <option key={option} value={option}>
                  {humanizeCode(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Файл</span>
            <input
              key={inputKey}
              accept={acceptForPurpose(purpose)}
              className="field-input file-input"
              disabled={pending}
              onChange={handleFileChange}
              required
              type="file"
            />
          </label>
        </div>

        <div className="surface surface-muted">
          <p className="section-text">{activeHint}</p>
          {selectedFile ? (
            <p className="section-text">
              Выбран файл: <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
            </p>
          ) : null}
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {success ? <div className="notice notice-success">{success}</div> : null}

        <div className="inline-actions">
          <button className="button button-primary" disabled={pending} type="submit">
            Загрузить файл
          </button>
          <span className="section-text">
            После загрузки backend повторно сверяет размер и mime type через `HEAD` в S3-compatible storage.
          </span>
        </div>
      </form>

      {files.length === 0 ? (
        <div className="surface surface-muted">
          <p className="section-text">Файлы пока не загружены.</p>
        </div>
      ) : (
        <div className="stack compact-stack">
          {files.map((file) => (
            <div className="surface surface-muted stack compact-stack" key={file.id}>
              <div className="section-head">
                <div>
                  <strong>{file.originalFilename ?? humanizeCode(file.purpose)}</strong>
                  <p className="section-text">
                    {humanizeCode(file.purpose)} • {file.mimeType} • {formatFileSize(file.sizeBytes)}
                  </p>
                </div>
                <span className={`status-badge status-${file.status}`}>{humanizeCode(file.status)}</span>
              </div>

              <div className="meta-row">
                <span>видимость: {humanizeCode(file.visibility)}</span>
                <span>создано: {formatCompactDateTime(file.createdAt)}</span>
              </div>

              {file.uploadedAt ? (
                <div className="meta-row">
                  <span>загружен: {formatCompactDateTime(file.uploadedAt)}</span>
                  <span>{file.canDownload ? "готов к скачиванию" : "скачивание недоступно"}</span>
                </div>
              ) : null}

              <div className="inline-actions">
                <button
                  className="button button-secondary button-small"
                  disabled={pending || !file.canDownload}
                  onClick={() => void handleDownload(file.id)}
                  type="button"
                >
                  Скачать
                </button>
                <button
                  className="button button-ghost button-small"
                  disabled={pending}
                  onClick={() => void handleDelete(file.id)}
                  type="button"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
