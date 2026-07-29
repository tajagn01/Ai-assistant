import { github, owner, repo } from "./client";

export async function readFile(path: string) {
  if (!owner || !repo) {
    throw new Error("GITHUB_OWNER and REPO must be defined");
  }

  const response = await github.request(
    "GET /repos/{owner}/{repo}/contents/{path}",
    {
      owner,
      repo,
      path,
    }
  );
  if (!("content" in response.data)) {
    throw new Error("Not a file");
  }
  const markdown = Buffer.from(
    response.data.content,
    "base64"
  ).toString("utf8");
  return markdown;
}