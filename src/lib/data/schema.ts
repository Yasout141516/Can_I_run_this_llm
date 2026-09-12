import { z } from "zod";
import { GGUF_BPW, NON_GGUF_BPW } from "../compat/quant";

export const SCHEMA_VERSION = 1;

const positive = z.number().positive();

export const gpuSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  vendor: z.enum(["nvidia", "amd", "intel", "apple"]),
  vramBytes: z.number().nonnegative(),
  memBandwidthGBs: positive.optional(),
});

export const laptopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["discrete-gpu", "apple-silicon", "cpu-only"]),
  gpuId: z.string().nullable(),
  vramBytes: z.number().nonnegative(),
  ramBytes: positive,
  ramType: z.enum(["DDR4", "DDR5", "LPDDR4X", "LPDDR5", "LPDDR5X", "unified"]),
});

export const quantSchema = z
  .object({
    id: z.string().min(1),
    format: z.enum(["gguf", "awq", "gptq", "fp8", "safetensors"]),
    sizeBytes: z.number().nonnegative(),
    sizeSource: z.enum(["measured", "estimated"]),
    fileName: z.string().min(1).optional(),
  })
  .refine((q) => q.sizeSource !== "measured" || q.fileName !== undefined, {
    message: "a measured size must name the file it was measured from",
    path: ["fileName"],
  })
  .refine((q) => q.sizeSource !== "measured" || q.sizeBytes > 0, {
    message: "a measured size must be greater than zero",
    path: ["sizeBytes"],
  })
  .refine(
    (q) => q.sizeSource !== "estimated" || q.id in GGUF_BPW || q.id in NON_GGUF_BPW,
    {
      message: "an estimated quant id must be priceable by the bits-per-weight table",
      path: ["id"],
    },
  );

export const modelSchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  displayName: z.string().min(1),
  params: z.object({ total: positive, active: positive.nullable() }),
  arch: z.object({
    numLayers: positive.int(),
    numKvHeads: positive.int(),
    headDim: positive.int(),
    maxContext: positive.int(),
  }),
  quants: z.array(quantSchema).min(1),
  benchmarks: z.record(
    z.enum(["mmlu", "mmlu_pro", "gpqa", "humaneval", "math", "ifeval", "swe_bench"]),
    z.number().nullable(),
  ),
  categories: z
    .array(z.enum(["chat", "code", "reasoning", "vision", "embedding", "medical", "finance", "legal"]))
    .min(1),
  source: z.object({
    hfRepo: z.string().min(1),
    ggufRepo: z.string().optional(),
    fetchedAt: z.string().min(1),
  }),
});

export const modelsFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  models: z.array(modelSchema),
});

export const gpusFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  gpus: z.array(gpuSchema),
});

export const laptopsFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  laptops: z.array(laptopSchema),
});
