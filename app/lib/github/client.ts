import { Octokit } from "octokit";

export const github = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export const owner = process.env.GITHUB_OWNER;
export const repo = process.env.REPO;
