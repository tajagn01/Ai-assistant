import { github, owner, repo } from "./client";

export async function listFolder(path: string) {
    if (!owner || !repo) {
        throw new Error("GITHUB_OWNER and REPO must be defined");
    }
    const { data } = await github.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path,
    });
    return data;
}