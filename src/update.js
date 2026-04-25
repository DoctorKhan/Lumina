export function parseVersion(value) {
  const match = String(value || "").match(/v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }

  return 0;
}

export function newestSemverTag(tags) {
  return (
    tags
      .map((tag) => tag?.name || tag?.tag_name || "")
      .filter((tag) => parseVersion(tag))
      .sort((left, right) => compareVersions(right, left))[0] || null
  );
}

export function selectLatestUpdateTag({ latestReleaseTag, tags }) {
  let latestTag = parseVersion(latestReleaseTag) ? latestReleaseTag : null;
  let source = latestTag ? "release" : null;
  const newestTag = newestSemverTag(tags);

  if (newestTag && (!latestTag || compareVersions(newestTag, latestTag) > 0)) {
    latestTag = newestTag;
    source = "tag";
  }

  return latestTag ? { tag: latestTag, source } : null;
}
