import type { FileStore } from "./source.ts";

/** The bucket and its credentials come from the S3_* environment variables that Bun reads. */
export function s3FileStore(client = new Bun.S3Client()): FileStore {
  return {
    async stat(key) {
      try {
        const { etag, lastModified } = await client.file(key).stat();
        return { revision: etag, modified: lastModified };
      } catch (error) {
        if ((error as { code?: string }).code === "NoSuchKey") return undefined;
        throw error;
      }
    },
    read: (key) => client.file(key).text(),
  };
}
