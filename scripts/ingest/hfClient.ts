export class IngestError extends Error {}

const API = "https://huggingface.co/api/models";

async function getJson(url: string, what: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new IngestError(`${what}: ${url} returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** One file in a repo listing. `size` is present only when the request asked
 *  for blobs; without it every quantisation would fall back to an estimate. */
export interface HfSibling {
  rfilename: string;
  size?: number;
}

export interface HfModelInfo {
  id: string;
  safetensors?: { total: number };
  siblings: HfSibling[];
}

/** blobs=true is what puts `size` on each sibling; without it every file
 *  reports undefined and every quantisation falls back to an estimate. */
export async function fetchModelInfo(repo: string): Promise<HfModelInfo> {
  const raw = (await getJson(`${API}/${repo}?blobs=true`, repo)) as Partial<HfModelInfo>;

  // Validate id is present and a string
  if (typeof raw.id !== "string") {
    throw new IngestError(`${repo}: id is missing or not a string`);
  }

  // Validate siblings is an array
  if (!Array.isArray(raw.siblings)) {
    throw new IngestError(`${repo}: siblings is not an array`);
  }

  return {
    id: raw.id,
    safetensors: raw.safetensors,
    siblings: raw.siblings,
  };
}

export async function fetchConfigJson(repo: string): Promise<Record<string, unknown>> {
  return (await getJson(
    `https://huggingface.co/${repo}/resolve/main/config.json`,
    `${repo} config.json`,
  )) as Record<string, unknown>;
}
