import { github, owner, repo } from "./client";

/**
 * Creates or updates a file in the user's Obsidian vault repository on GitHub.
 * If the file already exists, it fetches its current SHA to overwrite it.
 *
 * @param path - The repository relative file path (e.g. 'Daily/2026-07-29.md')
 * @param content - The raw string content to write
 * @param commitMessage - Description of the change (commit message)
 */
export async function createOrUpdateFile(
  path: string,
  content: string,
  commitMessage: string
) {
  if (!owner || !repo) {
    throw new Error("GITHUB_OWNER and REPO environment variables must be defined");
  }

  let sha: string | undefined;

  try {
    // Fetch file metadata to get the current SHA if it exists
    const response = await github.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path,
      }
    );

    if (response.data && !Array.isArray(response.data) && "sha" in response.data) {
      sha = response.data.sha;
    }
  } catch (error: any) {
    // 404 is expected when creating a new file, rethrow any other error
    if (error.status !== 404) {
      throw error;
    }
  }

  const base64Content = Buffer.from(content, "utf8").toString("base64");

  const response = await github.request(
    "PUT /repos/{owner}/{repo}/contents/{path}",
    {
      owner,
      repo,
      path,
      message: commitMessage,
      content: base64Content,
      sha,
    }
  );

  return response.data;
}
