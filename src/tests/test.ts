import fs from "fs";
import path from "path";
import assert from "assert";
import { checkLibraries } from "../index";

const TEST_DIR = path.join(__dirname, "fixtures");
const TEST_PACKAGE_JSON_PATH = path.join(TEST_DIR, "package.json");

const TEST_DEPENDENCIES = {
  "react-native-version-check": "^3.1.0",
  "@react-native/normalize-color": "^0.1.0",
  "@notifee/react-native": "^0.8.0",
  "react-native-loggly-jslogger": "^1.0.0",
  "react-native": "^0.68.0",
  "axios": "^0.27.2",
  "react-navigation": "^5.0.0",
};

const EXPECTED = {
  total: 6,
  supported: 3,
  notSupported: 1,
  notFound: 2,
} as const;

function handleTestFiles(cleanup = false): void {
  if (cleanup) {
    fs.existsSync(TEST_PACKAGE_JSON_PATH) && fs.unlinkSync(TEST_PACKAGE_JSON_PATH);
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

async function runTests(): Promise<void> {
  console.log("Starting tests...");

  try {
    handleTestFiles();
    const result = await checkLibraries(TEST_PACKAGE_JSON_PATH);

    Object.entries(EXPECTED).forEach(([key, value]) => {
      const actual = result[key as keyof typeof result];
      assert.strictEqual(
        actual,
        value,
        `Expected ${value} ${key}`
      );
    });

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