export default function setup() {
  // Point firebase-admin and @firebase/rules-unit-testing at the local emulator.
  // Must be set before any Firebase SDK module is imported in workers.
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.GCLOUD_PROJECT = "demo-finclair";
}
