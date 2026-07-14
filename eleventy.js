module.exports = function (eleventyConfig) {
  // Static assets pass straight through to the build output
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/img");

  // Files written into src/_data by the CI fetch scripts become
  // global Eleventy data automatically (e.g. src/_data/dsn.json -> `dsn` in templates)

  return {
    dir: {
      input: "src",
      output: "public",
      includes: "_includes",
      data: "_data",
    },
  };
};
