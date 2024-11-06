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
const FETCH_TIMEOUT = 10 * 1000;

const args = process.argv.slice(2);
let packagePath = "package.json";
const packagePathArg = args.find(
  (arg) => arg.startsWith("--path=") || arg.startsWith("-p=")
);

if (packagePathArg) {
  packagePath = packagePathArg.split("=")[1];
}

const showGroup = args.includes("--group") || args.includes("-g");
let supportedOnly =
  (args.includes("-s") || args.includes("--supported")) ?? true;
let notSupportedOnly = args.includes("-ns") || args.includes("--not-supported");
let notFoundOnly =
  (args.includes("-nf") || args.includes("--not-found")) ?? true;

if (!supportedOnly && !notSupportedOnly && !notFoundOnly) {
  //if no flags are provided, default to all librairies should be shown
  supportedOnly = true;
  notSupportedOnly = true;
  notFoundOnly = true;
}

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

export async function checkLibraries(path = packagePath): Promise<CheckResult> {
  console.log(`Checking libraries in ${path}...\n`);
  const packageJson: PackageJson = JSON.parse(readFileSync(path, "utf8"));
  const libraries = Object.keys(packageJson.dependencies ?? {}).filter(
    (lib) => !IGNORED_LIBRARIES.includes(lib)
  );

  console.log(`${libraries.length} libraries found\n`);
  console.log("Checking libraries...\n");

  const counts: Counts = { supported: 0, notSupported: 0, notFound: 0 };
  const groupedResults = {
    supported: [] as string[],
    notSupported: [] as string[],
    notFound: [] as string[],
  };

  // Track progress
  let processed = 0;

  await Promise.all(
    libraries.map(async (lib) => {
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
          const group = newArchSupport ? "supported" : "notSupported";
          groupedResults[group].push(lib);

          if (!showGroup) {
            if (supportedOnly && newArchSupport) {
              console.log(
                `Library: ${lib}, supports new architecture: ${color}${newArchSupport}${COLORS.reset}`
              );
            }
            if (notSupportedOnly && !newArchSupport) {
              console.log(
                `Library: ${lib}, supports new architecture: ${color}${newArchSupport}${COLORS.reset}`
              );
            }
          }

          counts[newArchSupport ? "supported" : "notSupported"]++;
        } else {
          const repoUrl = await getGitHubRepoUrl(lib);
          if (repoUrl) {
            const fullJsResult = await checkIfFullJS(repoUrl);
            handleFullJsResult(fullJsResult, lib);

            switch (fullJsResult) {
              case "fullJs":
                groupedResults.supported.push(lib);
                counts["supported"]++;

                break;
              case "native":
                groupedResults.notSupported.push(lib);
                counts["notSupported"]++;

                break;
              case "notFound":
                groupedResults.notFound.push(lib);
                counts.notFound++;

                break;
            }
          } else {
            groupedResults.notFound.push(lib);
            counts.notFound++;
          }
        }
      } catch (error) {
        console.error(`Error for library ${lib}: ${formatError(error)}`);
        groupedResults.notFound.push(lib);
        counts.notFound++;
      }

      processed++;
      // Show progress
      process.stdout.write(`Scanning ${processed} of ${libraries.length}...\r`);
    })
  );

  console.log("\n"); // Clear progress line

  if (showGroup) {
    printGroupedResults(groupedResults);
  } else {
    printResults(libraries.length, counts);
  }

  return {
    total: libraries.length,
    supported: counts.supported,
    notSupported: counts.notSupported,
    notFound: counts.notFound,
  };
}

function printGroupedResults(results: {
  supported: string[];
  notSupported: string[];
  notFound: string[];
}): void {
  if (supportedOnly) {
    console.log("\nSupported Libraries:");
    results.supported.forEach((lib) => console.log(lib));
  }
  if (notSupportedOnly) {
    console.log("\nNot Supported Libraries:");
    results.notSupported.forEach((lib) => console.log(lib));
  }
  if (notFoundOnly) {
    console.log("\nNot Found Libraries:");
    results.notFound.forEach((lib) => console.log(lib));
  }
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
    fullJs: `supports new architecture: ${COLORS.green}true${COLORS.reset} (full JS)`,
    native: `${COLORS.yellow}has native dependencies, you must ask the owner${COLORS.reset}`,
    notFound: `${COLORS.yellow}not found${COLORS.reset}`,
  };
  if (result === "fullJs" && supportedOnly) {
    console.log(`Library: ${lib}, ${messages[result]}`);
  }
  if (result === "native" && notSupportedOnly) {
    console.log(`Library: ${lib}, ${messages[result]}`);
  }
  if (result === "notFound" && notFoundOnly) {
    console.log(`Library: ${lib}, ${messages[result]}`);
  }
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
