import { FileStatus, FileVisibility } from "@prisma/client";

export const filePurposeConfigs = {
  psychologist_verification_document: {
    bucketKind: "private",
    visibility: FileVisibility.private,
    maxSizeBytes: 10 * 1024 * 1024,
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  psychologist_certificate: {
    bucketKind: "private",
    visibility: FileVisibility.private,
    maxSizeBytes: 10 * 1024 * 1024,
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  psychologist_diploma: {
    bucketKind: "private",
    visibility: FileVisibility.private,
    maxSizeBytes: 10 * 1024 * 1024,
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  psychologist_additional_document: {
    bucketKind: "private",
    visibility: FileVisibility.private,
    maxSizeBytes: 10 * 1024 * 1024,
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  psychologist_public_photo: {
    bucketKind: "public",
    visibility: FileVisibility.public,
    maxSizeBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
} as const;

export const filePurposeValues = Object.keys(filePurposeConfigs);

export const fileStatusValues = [FileStatus.pending, FileStatus.uploaded, FileStatus.deleted];

export type FilePurpose = keyof typeof filePurposeConfigs;
export type FileBucketKind = (typeof filePurposeConfigs)[FilePurpose]["bucketKind"];

export function getFilePurposeConfig(purpose: string) {
  return filePurposeConfigs[purpose as FilePurpose] ?? null;
}
