#!/usr/bin/env node
const fs = require("fs");

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not set");
  return JSON.parse(fs.readFileSync(eventPath, "utf8"));
}

function buildSummary(pullRequest) {
  const title = pullRequest.title || "Untitled pull request";
  const author = pullRequest.user && pullRequest.user.login ? pullRequest.user.login : "unknown";
  const additions = pullRequest.additions ?? 0;
  const deletions = pullRequest.deletions ?? 0;
  const files = pullRequest.changed_files ?? "unknown";
  const base = pullRequest.base && pullRequest.base.ref ? pullRequest.base.ref : "base";
  const head = pullRequest.head && pullRequest.head.ref ? pullRequest.head.ref : "head";
  const body = (pullRequest.body || "").trim();
  const description = body
    ? body.split("\n").slice(0, 8).join("\n")
    : "_No description yet. Use the Copilot sparkle icon in the description box before assigning reviewers._";

  return [
    "<!-- pr-summary-bot -->",
    "## Automated pull request summary",
    "",
    "**" + title + "** by @" + author,
    "",
    "- Branch: `" + head + "` -> `" + base + "`",
    "- Diff: +" + additions + " / -" + deletions + " (" + files + " files changed)",
    "- Reviewers: assign after this summary is in place",
    "",
    "### Description excerpt",
    "",
    description,
    "",
    "### Review focus",
    "",
    "- Confirm the change matches the stated intent",
    "- Check workflow permissions stay limited to this repository",
    "- Refresh the PR description with Copilot before requesting review",
    "",
  ].join("\n");
}

async function upsertComment(repository, pullNumber, body, dryRun) {
  if (dryRun) {
    process.stdout.write(body);
    return;
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const parts = repository.split("/");
  const owner = parts[0];
  const repo = parts[1];
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "copilot-api-portfolio-pr-summary",
  };
  const listUrl = "https://api.github.com/repos/" + owner + "/" + repo + "/issues/" + pullNumber + "/comments?per_page=100";
  const existing = await fetch(listUrl, { headers });
  if (!existing.ok) throw new Error("Failed to list comments: " + existing.status);
  const comments = await existing.json();
  const marker = "<!-- pr-summary-bot -->";
  const previous = comments.find((comment) => (comment.body || "").includes(marker));
  const url = previous
    ? "https://api.github.com/repos/" + owner + "/" + repo + "/issues/comments/" + previous.id
    : "https://api.github.com/repos/" + owner + "/" + repo + "/issues/" + pullNumber + "/comments";
  const response = await fetch(url, {
    method: previous ? "PATCH" : "POST",
    headers: Object.assign({}, headers, { "Content-Type": "application/json" }),
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error("Failed to post summary: " + response.status);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const event = readEvent();
  const pullRequest = event.pull_request;
  if (!pullRequest) throw new Error("Event payload has no pull_request");
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is not set");
  await upsertComment(repository, pullRequest.number, buildSummary(pullRequest), dryRun);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
