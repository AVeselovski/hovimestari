import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import {
  ImageUploadRequestSchema,
  type ImageUploadResponse,
} from "@hovi/shared";
import {
  ensureImagesDir,
  IMAGE_FILENAME_PATTERN,
  writeImage,
} from "../lib/imageStore.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function imagesRoutes(app: FastifyInstance): Promise<void> {
  const imagesDir = await ensureImagesDir();

  // serve:false → the plugin only decorates reply.sendFile; it does not register
  // its own wildcard route, so all access goes through the validated route below.
  await app.register(fastifyStatic, {
    root: imagesDir,
    serve: false,
  });

  app.get<{ Params: { filename: string } }>(
    "/images/:filename",
    async (req, reply) => {
      const { filename } = req.params;
      if (!IMAGE_FILENAME_PATTERN.test(filename)) {
        reply.code(400);
        return { error: "invalid_filename" };
      }
      return reply.sendFile(filename);
    },
  );

  app.post(
    "/images",
    { bodyLimit: 7 * 1024 * 1024 },
    async (req, reply) => {
      const parsed = ImageUploadRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: "invalid body", issues: parsed.error.issues };
      }

      let buffer: Buffer;
      try {
        buffer = Buffer.from(parsed.data.image.data, "base64");
      } catch {
        reply.code(400);
        return { error: "invalid_image_data" };
      }
      if (buffer.length === 0) {
        reply.code(400);
        return { error: "invalid_image_data" };
      }
      if (buffer.length > MAX_IMAGE_BYTES) {
        reply.code(400);
        return { error: "image_too_large" };
      }

      const imageId = await writeImage(buffer);
      const body: ImageUploadResponse = { imageId };
      return body;
    },
  );
}
