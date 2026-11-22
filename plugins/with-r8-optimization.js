
const {
  withAppBuildGradle,
  withGradleProperties,
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

  return config;
}

module.exports = withR8Optimization;
