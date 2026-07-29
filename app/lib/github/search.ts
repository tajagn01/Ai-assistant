import { github, owner, repo } from "./client";
import { SearchResult } from "@/app/types/github";

export async function searchFiles(
  query: string
): Promise<SearchResult[]> {
  if (!owner || !repo) {
    throw new Error("Owner or repo is not defined.");
  }

  const q = `${query} repo:${owner}/${repo} path:Knowledge`;

  const response = await github.request("GET /search/code", {
    q,
  });

  return response.data.items.map((item: any) => ({
    name: item.name,
    path: item.path,
    sha: item.sha,
  }));
}