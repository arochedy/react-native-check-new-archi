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

 const RESULT_CATEGORIES = {
   fullJs: "supported",
   native: "notSupported",
   notFound: "notFound",
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
let supportedOnly = args.includes("-s") || args.includes("--supported");
let notSupportedOnly = args.includes("-ns") || args.includes("--not-supported");
let notFoundOnly = args.includes("-nf") || args.includes("--not-found");

if (!supportedOnly && !notSupportedOnly && !notFoundOnly) {
  //if no flags are provided, default to all libraries should be shown
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
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

function updateCounts(
  category: keyof Counts,
  lib: string,
  counts: Counts,
  groupedResults: Record<keyof Counts, string[]>
) {
  counts[category]++;
  groupedResults[category].push(lib);
}

function isValidPackageJson(data: unknown): data is PackageJson {
  return !!data && typeof data === "object" && "dependencies" in data;
}

async function handleLibraryStatus(
  lib: string,
  counts: Counts,
  groupedResults: Record<keyof Counts, string[]>
) {
  try {
    const url = `https://reactnative.directory/api/libraries?search=${encodeURIComponent(
      lib
    )}`;
    const data: LibraryData = await fetchJson(url);

    if (data.libraries?.length) {
      const newArchSupport = !!(
        data.libraries[0].expoGo ||
        data.libraries[0].newArchitecture ||
        data.libraries[0].github?.newArchitecture
      );
      const status = newArchSupport ? "supported" : "notSupported";
      displayLibraryStatus(lib, status);
      updateCounts(status, lib, counts, groupedResults);
      return;
    }

    const repoUrl = await getGitHubRepoUrl(lib);
    if (repoUrl) {
      const fullJsResult = await checkIfFullJS(repoUrl);
      handleFullJsResult(fullJsResult, lib);
      updateCounts(
        RESULT_CATEGORIES[fullJsResult],
        lib,
        counts,
        groupedResults
      );
      return;
    }

    displayLibraryStatus(lib, "notFound");
    updateCounts("notFound", lib, counts, groupedResults);
  } catch (error) {
    console.error(`Error for library ${lib}: ${formatError(error)}`);
    updateCounts("notFound", lib, counts, groupedResults);
  }
}

export async function checkLibraries(path = packagePath): Promise<CheckResult> {
  console.log(`Checking libraries in ${path}...\n`);
  const rawData = JSON.parse(readFileSync(path, "utf8"));

  if (!isValidPackageJson(rawData)) {
    throw new Error("Invalid package.json format");
  }

  const libraries = Object.keys(rawData.dependencies ?? {}).filter(
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

  const progress = new Set<string>();

  await Promise.all(
    libraries.map(async (lib) => {
      await handleLibraryStatus(lib, counts, groupedResults);
      progress.add(lib);
      process.stdout.write(
        `Scanning ${progress.size} of ${libraries.length}...\r`
      );
    })
  );

  console.log("\n");

  if (showGroup) {
    printGroupedResults(groupedResults);
  } else {
    printResults(libraries.length, counts);
  }

  return {
    total: libraries.length,
    ...counts,
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
    if (!data?.repository?.url) return null;

    return data.repository.url.replace(/^git\+|\.git$/g, "");
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
  const branches = ["master", "main"];
  let packageJsonData: PackageJson | null = null;

  for (const branch of branches) {
    packageJsonData = await getPackageJsonData(repoUrl, branch);
    if (packageJsonData) break;
  }

  if (!packageJsonData) return "notFound";

  const allDeps = {
    ...packageJsonData.dependencies,
    ...packageJsonData.devDependencies,
  };

  return Object.keys(allDeps).some((dep) => dep.includes("react-native"))
    ? "native"
    : "fullJs";
}

function displayLibraryStatus(
  lib: string,
  status: "supported" | "notSupported" | "notFound",
) {
  if (!showGroup) {
    const messages = {
      supported: `${COLORS.green}true${COLORS.reset}`,
      notSupported: `${COLORS.red}false${COLORS.reset}`,
      notFound: `${COLORS.yellow}not found${COLORS.reset}`,
    };

    const shouldDisplay =
      (status === "supported" && supportedOnly) ||
      (status === "notSupported" && notSupportedOnly) ||
      (status === "notFound" && notFoundOnly);

    if (shouldDisplay) {
      console.log(
        `Library: ${lib}, supports new architecture: ${messages[status]}`
      );
    }
  }
}

function handleFullJsResult(
  result: "fullJs" | "native" | "notFound",
  lib: string
): void {
  const statusMap = {
    fullJs: { status: "supported" as const, details: "full JS" },
    native: {
      status: "notSupported" as const,
      details: "has native dependencies",
    },
    notFound: { status: "notFound" as const },
  };

  const { status } = statusMap[result];
  displayLibraryStatus(lib, status);
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
