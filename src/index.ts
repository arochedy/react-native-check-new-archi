#!/usr/bin/env node

import { readFileSync } from "fs";
import {
  PackageJson,
  LibraryData,
  CheckResult,
  Counts,
  NpmRegistryResponse,
} from "./types";

// Constants
const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
} as const;

const STATUS_MAP = {
  supported: { color: COLORS.green, message: "true", display: "Supported" },
  notSupported: {
    color: COLORS.red,
    message: "false",
    display: "Not Supported",
  },
  notFound: {
    color: COLORS.yellow,
    message: "not found",
    display: "Not Found",
  },
} as const;

const RESULT_CATEGORIES = {
  fullJs: "supported",
  native: "notSupported",
  notFound: "notFound",
} as const;

const IGNORED_LIBRARIES = ["react-native"];
const FETCH_TIMEOUT = 10 * 1000;
const BRANCHES = ["master", "main"] as const;

// Argument parsing
function parseArguments() {
  const args = process.argv.slice(2);
  const packagePath =
    args
      .find((arg) => arg.startsWith("--path=") || arg.startsWith("-p="))
      ?.split("=")[1] ?? "package.json";

  const showGroup = args.includes("--group") || args.includes("-g");
  const flags = {
    supported: args.includes("-s") || args.includes("--supported"),
    notSupported: args.includes("-ns") || args.includes("--not-supported"),
    notFound: args.includes("-nf") || args.includes("--not-found"),
  };

  if (!Object.values(flags).some(Boolean)) {
    flags.supported = flags.notSupported = flags.notFound = true;
  }

  return { packagePath, showGroup, flags };
}

// Utility functions
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function isValidPackageJson(data: unknown): data is PackageJson {
  return !!data && typeof data === "object" && "dependencies" in data;
}

// Network functions
async function fetchWithTimeout(url: string): Promise<Response> {
  return Promise.race([
    fetch(url),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), FETCH_TIMEOUT)
    ),
  ]);
}

async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
    }
  }
  throw new Error("Max retries reached");
}

// Display functions
function displayStatus(
  lib: string,
  status: keyof typeof STATUS_MAP,
  showGroup: boolean,
  flags: Record<string, boolean>
) {
  if (!showGroup && flags[status]) {
    const { color, message } = STATUS_MAP[status];
    console.log(
      `Library: ${lib}, supports new architecture: ${color}${message}${COLORS.reset}`
    );
  }
}

function displayResults(
  results: Record<string, string[]>,
  flags: Record<string, boolean>
) {
  Object.entries(results).forEach(([status, libs]) => {
    if (flags[status] && libs.length > 0)  {
      console.log(
        `${STATUS_MAP[status as keyof typeof STATUS_MAP].display} Libraries:`
      );
      libs.forEach((lib) => console.log(lib));
    }
  });
}

function printSummary(total: number, counts: Counts): void {
  const { green, red, yellow, reset } = COLORS;
  console.log(
    `Total: ${total} | ` +
      `Supported: ${green}${counts.supported}${reset} | ` +
      `Not Supported: ${red}${counts.notSupported}${reset} | ` +
      `Not Found: ${yellow}${counts.notFound}${reset}`
  );
}

// Library checking functions
async function getGitHubRepoUrl(libraryName: string): Promise<string | null> {
  try {
    const data = await fetchWithRetry<NpmRegistryResponse>(
      `https://registry.npmjs.org/${encodeURIComponent(libraryName)}`
    );
    return data?.repository?.url?.replace(/^git\+|\.git$/g, "") ?? null;
  } catch (error) {
    console.error(
      `Error fetching GitHub URL for ${libraryName}: ${formatError(error)}`
    );
    return null;
  }
}

async function checkIfFullJS(
  repoUrl: string
): Promise<keyof typeof RESULT_CATEGORIES> {
  for (const branch of BRANCHES) {
    try {
      const packageJson = await fetchWithRetry<PackageJson>(
        `${repoUrl.replace(
          "https://github.com",
          "https://raw.githubusercontent.com"
        )}/${branch}/package.json`
      );

      const hasNativeDeps = [
        ...Object.keys(packageJson.dependencies ?? {}),
        ...Object.keys(packageJson.devDependencies ?? {}),
      ].some((dep) => dep.includes("react-native"));

      return hasNativeDeps ? "native" : "fullJs";
    } catch {}
  }
  return "notFound";
}

async function checkLibrary(
  lib: string,
  counts: Counts,
  results: Record<keyof Counts, string[]>,
  config: { showGroup: boolean; flags: Record<string, boolean> }
): Promise<void> {
  try {
    const directoryData = await fetchWithRetry<LibraryData>(
      `https://reactnative.directory/api/libraries?search=${encodeURIComponent(
        lib
      )}`
    );

    let status: keyof typeof STATUS_MAP;

    if (directoryData.libraries?.length) {
      const { expoGo, newArchitecture, github } = directoryData.libraries[0];
      status =
        expoGo || newArchitecture || github?.newArchitecture
          ? "supported"
          : "notSupported";
    } else {
      const repoUrl = await getGitHubRepoUrl(lib);
      if (!repoUrl) {
        status = "notFound";
      } else {
        const fullJsResult = await checkIfFullJS(repoUrl);
        status = RESULT_CATEGORIES[fullJsResult];
      }
    }

    counts[status]++;
    results[status].push(lib);
    displayStatus(lib, status, config.showGroup, config.flags);
  } catch (error) {
    console.error(`Error checking ${lib}: ${formatError(error)}`);
    counts.notFound++;
    results.notFound.push(lib);
  }
}

// Main function
export async function checkLibraries(path?: string): Promise<CheckResult> {
  const { packagePath, showGroup, flags } = parseArguments();
  const finalPath = path ?? packagePath;

  console.log(`Checking libraries in ${finalPath}...\n`);
  const rawData = JSON.parse(readFileSync(finalPath, "utf8"));

  if (!isValidPackageJson(rawData)) {
    throw new Error("Invalid package.json format");
  }

  const libraries = Object.keys(rawData.dependencies ?? {}).filter(
    (lib) => !IGNORED_LIBRARIES.includes(lib)
  );

  console.log(`${libraries.length} libraries found\n`);
  console.log("Checking libraries...\n");

  const counts: Counts = { supported: 0, notSupported: 0, notFound: 0 };
  const results = {
    supported: [] as string[],
    notSupported: [] as string[],
    notFound: [] as string[],
  };

  const progress = new Set<string>();

  await Promise.all(
    libraries.map(async (lib) => {
      await checkLibrary(lib, counts, results, { showGroup, flags });
      progress.add(lib);
      process.stdout.write(
        `Scanning ${progress.size} of ${libraries.length}...\r`
      );
    })
  );

  console.log("\n");

  if (showGroup) {
    displayResults(results, flags);
  } else {
    printSummary(libraries.length, counts);
  }

  return {
    total: libraries.length,
    ...counts,
  };
}

if (require.main === module) {
  checkLibraries();
}
