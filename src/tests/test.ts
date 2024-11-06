import fs from "fs";
import path from "path";
import assert from "assert";
import { checkLibraries } from "../index";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

// Constants
const TEST_DIR = path.join(__dirname, "fixtures");
const TEST_PACKAGE_JSON_PATH = path.join(TEST_DIR, "package.json");

const TEST_DEPENDENCIES = {
  "react-native-version-check": "^3.1.0",
  "@react-native/normalize-color": "^0.1.0",
  "@notifee/react-native": "^0.8.0",
  "react-native-loggly-jslogger": "^1.0.0",
  "react-native": "^0.68.0",
  axios: "^0.27.2",
  "react-navigation": "^5.0.0",
};

const GROUPS = {
  SUPPORTED: "Supported Libraries",
  NOT_SUPPORTED: "Not Supported Libraries",
  NOT_FOUND: "Not Found Libraries",
} as const;

const STATUS = {
  SUPPORTED: "true",
  NOT_SUPPORTED: "false",
  NOT_FOUND: "not found",
} as const;

const EXPECTED = {
  total: 6,
  supported: 3,
  notSupported: 1,
  notFound: 2,
};

const LIBRARIES = {
  SUPPORTED: ["react-navigation", "axios", "@notifee/react-native"],
  NOT_SUPPORTED: ["react-native-version-check"],
  NOT_FOUND: ["react-native-loggly-jslogger", "@react-native/normalize-color"],
};

function handleTestFiles(cleanup = false): void {
  if (cleanup) {
    fs.existsSync(TEST_PACKAGE_JSON_PATH) &&
      fs.unlinkSync(TEST_PACKAGE_JSON_PATH);
    fs.existsSync(TEST_DIR) && fs.rmdirSync(TEST_DIR);
    return;
  }

  !fs.existsSync(TEST_DIR) && fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(
    TEST_PACKAGE_JSON_PATH,
    JSON.stringify({ dependencies: TEST_DEPENDENCIES }, null, 2)
  );
}

async function testArgument(config: {
  arg: string;
  expected: string[];
  notExpected?: string[];
}) {
  try {
    const { stdout } = await execPromise(`node ./dist/index.js ${config.arg}`);
    config.expected.forEach((exp) =>
      assert(stdout.includes(exp), `Expected output to include "${exp}"`)
    );
    config.notExpected?.forEach((notExp) =>
      assert(
        !stdout.includes(notExp),
        `Expected output not to include "${notExp}"`
      )
    );
    console.log(`✓ Test with argument "${config.arg}" passed`);
  } catch (error) {
    console.error(`✗ Test with argument "${config.arg}" failed: ${error}`);
    process.exit(1);
  }
}

async function runTests(): Promise<void> {
  console.log("Starting tests...");

  try {
    handleTestFiles();
    const result = await checkLibraries(TEST_PACKAGE_JSON_PATH);

    // Verify expected results
    Object.entries(EXPECTED).forEach(([key, value]) => {
      assert.strictEqual(
        result[key as keyof typeof result],
        value,
        `Expected ${value} ${key}`
      );
    });

    // Test cases
    const testCases = [
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} --group`,
        expected: [GROUPS.NOT_SUPPORTED, GROUPS.SUPPORTED, GROUPS.NOT_FOUND],
      },
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} -s`,
        expected: [STATUS.SUPPORTED, ...LIBRARIES.SUPPORTED],
        notExpected: [
          STATUS.NOT_SUPPORTED,
          STATUS.NOT_FOUND,
          ...LIBRARIES.NOT_SUPPORTED,
          ...LIBRARIES.NOT_FOUND,
        ],
      },
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} --supported`,
        expected: [STATUS.SUPPORTED, ...LIBRARIES.SUPPORTED],
        notExpected: [
          STATUS.NOT_SUPPORTED,
          STATUS.NOT_FOUND,
          ...LIBRARIES.NOT_SUPPORTED,
          ...LIBRARIES.NOT_FOUND,
        ],
      },
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} -ns`,
        expected: [STATUS.NOT_SUPPORTED, ...LIBRARIES.NOT_SUPPORTED],
        notExpected: [
          STATUS.SUPPORTED,
          STATUS.NOT_FOUND,
          ...LIBRARIES.SUPPORTED,
          ...LIBRARIES.NOT_FOUND,
        ],
      },
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} --not-supported`,
        expected: [STATUS.NOT_SUPPORTED, ...LIBRARIES.NOT_SUPPORTED],
        notExpected: [
          STATUS.SUPPORTED,
          STATUS.NOT_FOUND,
          ...LIBRARIES.SUPPORTED,
          ...LIBRARIES.NOT_FOUND,
        ],
      },
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} -nf`,
        expected: [STATUS.NOT_FOUND, ...LIBRARIES.NOT_FOUND],
        notExpected: [
          STATUS.SUPPORTED,
          STATUS.NOT_SUPPORTED,
          ...LIBRARIES.SUPPORTED,
          ...LIBRARIES.NOT_SUPPORTED,
        ],
      },
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} --not-found`,
        expected: [STATUS.NOT_FOUND, ...LIBRARIES.NOT_FOUND],
        notExpected: [
          STATUS.SUPPORTED,
          STATUS.NOT_SUPPORTED,
          ...LIBRARIES.SUPPORTED,
          ...LIBRARIES.NOT_SUPPORTED,
        ],
      },

      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} -s --group`,
        expected: [GROUPS.SUPPORTED, ...LIBRARIES.SUPPORTED],
        notExpected: [
          GROUPS.NOT_SUPPORTED,
          GROUPS.NOT_FOUND,
          ...LIBRARIES.NOT_SUPPORTED,
          ...LIBRARIES.NOT_FOUND,
        ],
      },
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} -s -nf --group`,
        expected: [
          GROUPS.SUPPORTED,
          GROUPS.NOT_FOUND,
          ...LIBRARIES.SUPPORTED,
          ...LIBRARIES.NOT_FOUND,
        ],
        notExpected: [GROUPS.NOT_SUPPORTED, ...LIBRARIES.NOT_SUPPORTED],
      },
      {
        arg: `--path=${TEST_PACKAGE_JSON_PATH} -s -ns --group`,
        expected: [
          GROUPS.SUPPORTED,
          GROUPS.NOT_SUPPORTED,
          ...LIBRARIES.SUPPORTED,
          ...LIBRARIES.NOT_SUPPORTED,
        ],
        notExpected: [GROUPS.NOT_FOUND, ...LIBRARIES.NOT_FOUND],
      },
    ];

    for (const testCase of testCases) {
      await testArgument(testCase);
    }

    console.log("✓ All tests passed successfully");
  } catch (error) {
    console.error(
      "✗ Test failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    handleTestFiles(true);
  }
}

runTests();
