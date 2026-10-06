/**
 * The alpha release of @tensorflow/tfjs-tflite ships a broken ES entry (dist/index.js
 * imports ./tflite_web_api_client, which is not in the package); the self-contained
 * UMD bundle works. This gives that bundle the package's own types.
 */
declare module "@tensorflow/tfjs-tflite/dist/tf-tflite.min.js" {
  export * from "@tensorflow/tfjs-tflite";
}
