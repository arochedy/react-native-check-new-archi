import fs from "fs";
import path from "path";
import assert from "assert";
import { checkLibraries } from "../index";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

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

const NOT_FOUND_GROUP_TITLE = "Not Found Libraries";
const SUPPORTED_GROUP_TITLE = "Supported Libraries";
const NOT_SUPPORTED_GROUP_TITLE = "Not Supported Libraries";

const NOT_FOUND = "not found";
const SUPPORTED = "true";
const NOT_SUPPORTED = "false";

const EXPECTED = {
  total: 6,
  supported: 3,
  notSupported: 1,
  notFound: 2,
} as const;

const SUPPORTED_LIBRARIES = [
  "react-navigation",
  "axios",
  "@notifee/react-native",
];

const NOT_SUPPORTED_LIBRARIES = ["react-native-version-check"];

const NOT_FOUND_LIBRARIES = [
  "react-native-loggly-jslogger",
  "@react-native/normalize-color",
];

function handleTestFiles(cleanup = false): void {
  if (cleanup) {
    fs.existsSync(TEST_PACKAGE_JSON_PATH) &&
      fs.unlinkSync(TEST_PACKAGE_JSON_PATH);
    fs.existsSync(TEST_DIR) && fs.rmdirSync(TEST_DIR);
    return;
  }

  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  fs.writeFileSync(
    TEST_PACKAGE_JSON_PATH,
    JSON.stringify({ dependencies: TEST_DEPENDENCIES }, null, 2)
  );
}

async function testArgument(
  arg: string,
  expected: string[],
  notExpected?: string[]
) {
  try {
    const { stdout } = await execPromise(`node ./dist/index.js ${arg}`);
    console.log(stdout);
    for (const expectedStr of expected) {
      assert(
        stdout.includes(expectedStr),
        `Expected output to include "${expectedStr}"`
      );
    }
    for (const notExpectedStr of notExpected ?? []) {
      assert(
        !stdout.includes(notExpectedStr),
        `Expected output not to include "${notExpectedStr}"`
      );
    }
    console.log(`✓ Test with argument "${arg}" passed`);
  } catch (error) {
    console.error(`✗ Test with argument "${arg}" failed: ${error}`);
    process.exit(1);
  }
}

async function runTests(): Promise<void> {
  console.log("Starting tests...");

  try {
    handleTestFiles();
    const result = await checkLibraries(TEST_PACKAGE_JSON_PATH);

    Object.entries(EXPECTED).forEach(([key, value]) => {
      const actual = result[key as keyof typeof result];
      assert.strictEqual(actual, value, `Expected ${value} ${key}`);
    });

    // Test arguments
    await testArgument(`--path=${TEST_PACKAGE_JSON_PATH} --group`, [
      NOT_SUPPORTED_GROUP_TITLE,
      SUPPORTED_GROUP_TITLE,
      NOT_FOUND_GROUP_TITLE,
    ]);
    await testArgument(
      `--path=${TEST_PACKAGE_JSON_PATH}  -s`,
      [SUPPORTED, ...SUPPORTED_LIBRARIES],
      [
        NOT_SUPPORTED,
        NOT_FOUND,
        ...NOT_SUPPORTED_LIBRARIES,
        ...NOT_FOUND_LIBRARIES,
      ]
    );

    await testArgument(
      `--path=${TEST_PACKAGE_JSON_PATH}  --supported`,
      [SUPPORTED, ...SUPPORTED_LIBRARIES],
      [
        NOT_SUPPORTED,
        NOT_FOUND,
        ...NOT_SUPPORTED_LIBRARIES,
        ...NOT_FOUND_LIBRARIES,
      ]
    );
    await testArgument(
      `--path=${TEST_PACKAGE_JSON_PATH}  -ns`,
      [NOT_SUPPORTED, ...NOT_SUPPORTED_LIBRARIES],
      [SUPPORTED, NOT_FOUND, ...SUPPORTED_LIBRARIES, ...NOT_FOUND_LIBRARIES]
    );

    await testArgument(
      `--path=${TEST_PACKAGE_JSON_PATH}  --not-supported`,
      [NOT_SUPPORTED, ...NOT_SUPPORTED_LIBRARIES],
      [SUPPORTED, NOT_FOUND, ...SUPPORTED_LIBRARIES, ...NOT_FOUND_LIBRARIES]
    );
    await testArgument(
      `--path=${TEST_PACKAGE_JSON_PATH}  -nf`,
      [NOT_FOUND, ...NOT_FOUND_LIBRARIES],
      [
        SUPPORTED,
        NOT_SUPPORTED,
        ...SUPPORTED_LIBRARIES,
        ...NOT_SUPPORTED_LIBRARIES,
      ]
    );

    await testArgument(
      `--path=${TEST_PACKAGE_JSON_PATH}  --not-found`,
      [NOT_FOUND, ...NOT_FOUND_LIBRARIES],
      [
        SUPPORTED,
        NOT_SUPPORTED,
        ...SUPPORTED_LIBRARIES,
        ...NOT_SUPPORTED_LIBRARIES,
      ]
    );
    await testArgument(
      `--path=${TEST_PACKAGE_JSON_PATH}  -s --group`,
      [SUPPORTED_GROUP_TITLE, ...SUPPORTED_LIBRARIES],
      [
        NOT_SUPPORTED_GROUP_TITLE,
        NOT_FOUND_GROUP_TITLE,
        ...NOT_SUPPORTED_LIBRARIES,
        ...NOT_FOUND_LIBRARIES,
      ]
    );

    await testArgument(
      `--path=${TEST_PACKAGE_JSON_PATH}  -s -nf --group`,
      [
        SUPPORTED_GROUP_TITLE,
        NOT_FOUND_GROUP_TITLE,
        ...SUPPORTED_LIBRARIES,
        ...NOT_FOUND_LIBRARIES,
      ],
      [NOT_SUPPORTED_GROUP_TITLE]
    );

    await testArgument(
      "--path=./dist/tests/fixtures/package.json  -s -ns --group",
      [
        NOT_SUPPORTED_GROUP_TITLE,
        SUPPORTED_GROUP_TITLE,
        "react-native-version-check",
      ],
      [NOT_FOUND_GROUP_TITLE, ...NOT_FOUND_LIBRARIES]
    );

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
