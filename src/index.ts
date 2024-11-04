#!/usr/bin/env node

import { readFileSync } from "fs";
import {
  PackageJson,
  LibraryData,
  CheckResult,
  Counts,
  NpmRegistryResponse,
} from "./types";

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
} as const;

const IGNORED_LIBRARIES = ["react-native"];
const FETCH_TIMEOUT = 10000; // 10 seconds

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return Promise.race([
    fetch(url),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), FETCH_TIMEOUT)
    ),
  ]);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url);
  return response.json();
}

export async function checkLibraries(
  path = "package.json"
): Promise<CheckResult> {
  const packageJson: PackageJson = JSON.parse(readFileSync(path, "utf8"));
  const libraries = Object.keys(packageJson.dependencies ?? {}).filter(
    (lib) => !IGNORED_LIBRARIES.includes(lib)
  );

  console.log(`${libraries.length} libraries found\n`);
  console.log("Checking libraries...\n");

  const counts: Counts = { supported: 0, notSupported: 0, notFound: 0 };

  for (const lib of libraries) {
    try {
      const url = `https://reactnative.directory/api/libraries?search=${encodeURIComponent(
        lib
      )}`;
      const data: LibraryData = await fetchJson(url);

      if (data.libraries?.length) {
        const libraryData = data.libraries[0];
        const newArchSupport = !!(
          libraryData.expoGo ||
          libraryData.newArchitecture ||
          libraryData.github?.newArchitecture
        );

        const color = newArchSupport ? COLORS.green : COLORS.red;
        console.log(
          `Library: ${lib}, supports new architecture: ${color}${newArchSupport}${COLORS.reset}`
        );
        newArchSupport ? counts.supported++ : counts.notSupported++;
      } else {
        // Try to get GitHub repo URL from npm registry
        const repoUrl = await getGitHubRepoUrl(lib);
        if (repoUrl) {
          const fullJsResult = await checkIfFullJS(repoUrl);
          handleFullJsResult(fullJsResult, lib);

          switch (fullJsResult) {
            case "fullJs":
              counts.supported++;
              break;
            case "native":
              counts.notSupported++;
              break;
            case "notFound":
              counts.notFound++;
              break;
          }
        } else {
          counts.notFound++;
        }
      }
    } catch (error) {
      console.error(`Error for library ${lib}: ${formatError(error)}`);
      counts.notFound++;
    }
  }

  // Display final statistics on a single line
  printResults(libraries.length, counts);

  // Return result (for testing purposes)
  return {
    total: libraries.length,
    supported: counts.supported,
    notSupported: counts.notSupported,
    notFound: counts.notFound,
  };
}


async function getGitHubRepoUrl(libraryName: string): Promise<string | null> {
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(libraryName)}`;
    const data = await fetchJson<NpmRegistryResponse>(url);
    return (
      data.repository?.url?.replace("git+", "").replace(".git", "") ?? null
    );
  } catch (error) {
    console.error(
      `Error fetching GitHub URL for ${libraryName}: ${formatError(error)}`
    );
    return null;
  }
}

async function getPackageJsonData(
  repoUrl: string,
  branch: string
): Promise<PackageJson | null> {
  try {
    const packageJsonUrl = `${repoUrl.replace(
      "https://github.com",
      "https://raw.githubusercontent.com"
    )}/${branch}/package.json`;

    const response = await fetchWithTimeout(packageJsonUrl);
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

async function checkIfFullJS(
  repoUrl: string
): Promise<"fullJs" | "native" | "notFound"> {
  const packageJsonData =
    (await getPackageJsonData(repoUrl, "master")) ??
    (await getPackageJsonData(repoUrl, "main"));

  if (!packageJsonData) return "notFound";

  const hasNativeDeps = [
    ...Object.keys(packageJsonData.dependencies ?? {}),
    ...Object.keys(packageJsonData.devDependencies ?? {}),
  ].some((dep) => dep.includes("react-native"));

  return hasNativeDeps ? "native" : "fullJs";
}

function handleFullJsResult(
  result: "fullJs" | "native" | "notFound",
  lib: string
): void {
  const messages = {
    fullJs: `${COLORS.green}supports new architecture (full JS)${COLORS.reset}`,
    native: `${COLORS.yellow}has native dependencies, you must ask the owner${COLORS.reset}`,
    notFound: `${COLORS.yellow}not found${COLORS.reset}`,
  };
  console.log(`Library: ${lib}, ${messages[result]}`);
}

function printResults(total: number, counts: Counts): void {
  const { green, red, yellow, reset } = COLORS;
  console.log(
    `Total: ${total} | ` +
      `Supported: ${green}${counts.supported}${reset} | ` +
      `Not Supported: ${red}${counts.notSupported}${reset} | ` +
      `Not Found: ${yellow}${counts.notFound}${reset}`
  );
}

if (require.main === module) {
  checkLibraries();
}
