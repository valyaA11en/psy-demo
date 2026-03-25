import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FileBucketKind, FilePurpose } from "./files.constants";

type PresignedUploadResult = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
  expiresInSec: number;
};

type PresignedDownloadResult = {
  url: string;
  expiresAt: string;
  expiresInSec: number;
};

type HeadObjectResult = {
  contentType: string | null;
  contentLength: number | null;
  eTag: string | null;
};

@Injectable()
export class FilesStorageService {
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>("S3_REGION", "us-east-1");
    const forcePathStyle = this.parseBoolean(
      this.configService.get<string>("S3_FORCE_PATH_STYLE", "true"),
    );
    const credentials = {
      accessKeyId: this.configService.get<string>("S3_ACCESS_KEY", "minioadmin"),
      secretAccessKey: this.configService.get<string>("S3_SECRET_KEY", "change_me"),
    };

    this.internalClient = new S3Client({
      region,
      forcePathStyle,
      endpoint: this.configService.get<string>("S3_INTERNAL_ENDPOINT", "http://minio:9000"),
      credentials,
    });

    this.publicClient = new S3Client({
      region,
      forcePathStyle,
      endpoint: this.configService.get<string>("S3_PUBLIC_ENDPOINT", "http://localhost/s3"),
      credentials,
    });
  }

  resolveBucket(bucketKind: FileBucketKind) {
    return bucketKind === "public"
      ? this.configService.get<string>("S3_BUCKET_PUBLIC", "consultations-public")
      : this.configService.get<string>("S3_BUCKET_PRIVATE", "consultations-private");
  }

  createObjectKey(ownerUserId: string, purpose: FilePurpose, originalFilename: string, mimeType: string) {
    const extension = this.resolveExtension(originalFilename, mimeType);
    return `${ownerUserId}/${purpose}/${randomUUID()}${extension}`;
  }

  async createPresignedUpload(input: {
    bucket: string;
    objectKey: string;
    mimeType: string;
  }): Promise<PresignedUploadResult> {
    const expiresInSec = this.configService.get<number>("S3_PRESIGNED_UPLOAD_TTL_SEC", 900);
    const url = await getSignedUrl(
      this.publicClient,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ContentType: input.mimeType,
      }),
      { expiresIn: expiresInSec },
    );

    return {
      method: "PUT",
      url,
      headers: {
        "Content-Type": input.mimeType,
      },
      expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      expiresInSec,
    };
  }

  async createPresignedDownload(input: {
    bucket: string;
    objectKey: string;
    mimeType: string;
    visibility: "private" | "public";
  }): Promise<PresignedDownloadResult> {
    const expiresInSec = this.configService.get<number>("S3_PRESIGNED_DOWNLOAD_TTL_SEC", 300);
    const responseContentDisposition =
      input.visibility === "public" && input.mimeType.startsWith("image/")
        ? "inline"
        : "attachment";
    const url = await getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ResponseContentDisposition: responseContentDisposition,
      }),
      { expiresIn: expiresInSec },
    );

    return {
      url,
      expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      expiresInSec,
    };
  }

  async headObject(bucket: string, objectKey: string): Promise<HeadObjectResult | null> {
    try {
      const response = await this.internalClient.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }),
      );

      return {
        contentType: response.ContentType?.trim().toLowerCase() ?? null,
        contentLength: typeof response.ContentLength === "number" ? response.ContentLength : null,
        eTag: response.ETag?.replaceAll('"', "") ?? null,
      };
    } catch (error: unknown) {
      if (this.isObjectMissingError(error)) {
        return null;
      }

      throw error;
    }
  }

  async deleteObject(bucket: string, objectKey: string) {
    await this.internalClient.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
  }

  private resolveExtension(originalFilename: string, mimeType: string) {
    const normalizedExt = extname(originalFilename).toLowerCase();

    if (normalizedExt && normalizedExt.length <= 10) {
      return normalizedExt;
    }

    switch (mimeType.trim().toLowerCase()) {
      case "application/pdf":
        return ".pdf";
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      case "image/webp":
        return ".webp";
      default:
        return "";
    }
  }

  private parseBoolean(value: string) {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }

  private isObjectMissingError(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const candidate = error as {
      name?: string;
      $metadata?: {
        httpStatusCode?: number;
      };
    };

    return (
      candidate.name === "NotFound" ||
      candidate.name === "NoSuchKey" ||
      candidate.$metadata?.httpStatusCode === 404
    );
  }
}
