import { S3Client } from "bun";

import type { ObjectStorage } from "./source.ts";

export function s3Storage(options: {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): ObjectStorage {
  const client = new S3Client(options);
  // Presigned URLs let fetch bound each request with a timeout, which the S3 client cannot.
  async function send(key: string, method: "GET" | "PUT", body?: string) {
    const response = await fetch(client.presign(key, { method }), {
      method,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(
        `Object storage answered ${response.status} to ${method} ${key}`,
      );
    }
    return response;
  }
  return {
    read: async (key) => (await send(key, "GET")).text(),
    write: async (key, text) => {
      await send(key, "PUT", text);
    },
  };
}
