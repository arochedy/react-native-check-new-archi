import fs from "fs";
import path from "path";
import assert from "assert";
import { checkLibraries } from "../index"; // Assurez-vous que checkLibraries est exporté dans index.ts

// Redéfinition du chemin du fichier package.json pour les tests
const testPackageJsonPath = path.join(__dirname, "..", "tests", "package.json");

// Fonction de simulation pour créer un package.json de test
function createTestPackageJson() {
  const testPackageJson = {
    dependencies: {
      "react-native-version-check": "^3.1.0",
      "@react-native/normalize-color": "^0.1.0",
      "@notifee/react-native": "^0.8.0",
      "react-native-loggly-jslogger": "^1.0.0",
      "react-native": "^0.68.0",
      axios: "^0.27.2",
      "react-navigation": "^5.0.0",
    },
  };

  fs.writeFileSync(
    testPackageJsonPath,
    JSON.stringify(testPackageJson, null, 2)
  );
}

// Fonction de nettoyage pour supprimer le package.json de test
function deleteTestPackageJson() {
  if (fs.existsSync(testPackageJsonPath)) {
    fs.unlinkSync(testPackageJsonPath);
  }
}

async function runTest() {
  console.log("Starting test...");

  createTestPackageJson();

  const expectedTotal = 6; //exclude react-native

  const expectedSupported = 3;
  const expectedNotSupported = 1;
  const expectedNotFound = 2;

  // Capture les résultats de checkLibraries
  const result = await checkLibraries(testPackageJsonPath);

  //
  assert.strictEqual(
    result.total,
    expectedTotal,
    `${expectedTotal} total libraries`
  );
  assert.strictEqual(
    result.supported,
    expectedSupported,
    `Expected ${expectedSupported} supported libraries`
  );
  assert.strictEqual(
    result.notSupported,
    expectedNotSupported,
    `Expected ${expectedNotSupported} not supported libraries`
  );
  assert.strictEqual(
    result.notFound,
    expectedNotFound,
    `Expected ${expectedNotFound} not found libraries`
  );

  // Supprimer le fichier package.json de test après le test
  deleteTestPackageJson();

  console.log("All tests passed.");
}

// Lancer le test
runTest().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
