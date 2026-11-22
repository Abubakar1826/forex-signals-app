
const {
  withAppBuildGradle,
  withGradleProperties,
  withAndroidManifest,
} = require("@expo/config-plugins");

function withR8Optimization(config) {
  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    const pattern =
      /getDefaultProguardFile\((["'])proguard-android\.txt\1\)/g;

    if (contents.includes("proguard-android-optimize.txt")) {
      // Already optimized.
    } else if (pattern.test(contents)) {
      contents = contents.replace(
        pattern,
        'getDefaultProguardFile("proguard-android-optimize.txt")'
      );
    } else {
      throw new Error(
        "R8 plugin: expected ProGuard configuration not found."
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  config = withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const key = "android.r8.optimizedResourceShrinking";

    const existing = properties.find(
      (item) => item.type === "property" && item.key === key
    );

    if (existing) {
      existing.value = "true";
    } else {
      properties.push({
        type: "property",
        key,
        value: "true",
      });
    }

    return config;
  });

  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const usesFeatures = manifest["uses-feature"] ?? [];
    const featureName = "android.hardware.screen.portrait";

    const portraitFeature = usesFeatures.find(
      (feature) => feature.$?.["android:name"] === featureName
    );

    if (portraitFeature) {
      portraitFeature.$["android:required"] = "false";
    } else {
      usesFeatures.push({
        $: {
          "android:name": featureName,
          "android:required": "false",
        },
      });
    }

    manifest["uses-feature"] = usesFeatures;
    return config;
  });

  return config;
}

module.exports = withR8Optimization;
