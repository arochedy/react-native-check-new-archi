#!/usr/bin/env node

const fs = require("fs");

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

// List of libraries to ignore
const ignoredLibraries = ["react-native"];

async function checkLibraries() {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const dependencies = packageJson.dependencies || {};
  const libraries = Object.keys(dependencies).filter(
    (lib) => !ignoredLibraries.includes(lib)
  );

  console.log(`${libraries.length} libraries found\n`);

  let countOk = 0;
  let countKo = 0;
  let countNotFound = 0;

  console.log("Checking libraries...\n");

  for (const lib of libraries) {
    try {
      const url = `https://reactnative.directory/api/libraries?search=${lib}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.libraries && data.libraries.length > 0) {
        const libraryData = data.libraries[0];
        const newArchSupport =
          libraryData.expoGo || libraryData.github.newArchitecture || false;
        const color = newArchSupport ? COLORS.green : COLORS.red;

        console.log(
          `Library: ${lib}, supports new architecture: ${color}${newArchSupport}${COLORS.reset}`
        );
        newArchSupport ? countOk++ : countKo++;
      } else {
        // Try to get GitHub repo URL from npm registry
        const repoUrl = await getGitHubRepoUrl(lib);
        if (repoUrl) {
          const fullJsResult = await checkIfFullJS(repoUrl);
          switch (fullJsResult) {
            case "fullJs":
              countOk++;
              console.log(
                `Library: ${lib}, ${COLORS.green}supports new architecture (full JS)${COLORS.reset}`
              );
              break;
            case "native":
              console.log(
                `Library: ${lib}, ${COLORS.yellow} has native dependencies, you must ask the owner ${COLORS.reset}`
              );
              countKo++;
              break;
            case "notFound":
              console.log(
                `Library: ${lib}, ${COLORS.yellow}not found${COLORS.reset}`
              );
              countNotFound++;
              break;
          }
        }
      }
    } catch (error: any) {
      console.error(`Error for library ${lib}: ${error.message}`);
      countNotFound++;
    }
  }

  // Display final statistics on a single line
  console.log(
    `Total: ${libraries.length} | ` +
      `Supported: ${COLORS.green}${countOk}${COLORS.reset} | ` +
      `Not Supported: ${COLORS.red}${countKo}${COLORS.reset} | ` +
      `Not Found: ${COLORS.yellow}${countNotFound}${COLORS.reset}`
  );
}

async function getGitHubRepoUrl(libraryName: string): Promise<string | null> {
  // Attempt to get the GitHub repo URL via the npm registry
  try {
    const url = `https://registry.npmjs.org/${libraryName}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.repository
      ? data.repository.url.replace("git+", "").replace(".git", "")
      : null;
  } catch (error: any) {
    console.error(
      `Error fetching GitHub URL for ${libraryName}: ${error.message}`
    );
    return null;
  }
}

async function checkIfFullJS(repoUrl: string) {
  const packageJsonUrl = `${repoUrl.replace(
    "https://github.com/",
    "https://raw.githubusercontent.com/"
  )}/refs/heads/master/package.json`;

  // https://raw.githubusercontent.com/react-navigation/react-navigation/refs/heads/main/package.json
  // https://raw.githubusercontent.com/react-navigation/react-navigation/refs/heads/master/package.json
  try {
    const response = await fetch(packageJsonUrl);
    const data = await response.json();

    // Check dependencies and devDependencies for native modules
    const dependencies = { ...data.dependencies, ...data.devDependencies };
    const hasNativeDeps = Object.keys(dependencies || {}).some((dep) =>
      dep.includes("react-native")
    );

    return hasNativeDeps ? "native" : "fullJs";
    //  // true if no native dependencies found
  } catch (error) {
    // console.error(`Error fetching package.json from ${repoUrl} ${packageJsonUrl}: ${error.message}`);
    return "notFound";
  }
}

checkLibraries();
