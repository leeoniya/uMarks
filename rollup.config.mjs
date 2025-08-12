import terser from '@rollup/plugin-terser';

const terserOpts = {
	compress: {
		inline: 0,
		passes: 2,
		keep_fargs: false,
		pure_getters: true,
		unsafe: true,
		unsafe_comps: true,
		unsafe_math: true,
		unsafe_undefined: true,
	},
};

export default [
  {
    input: "./src/uMarks.mjs",
    output: {
      name: 'uMarks',
      file: "./dist/uMarks.mjs",
      format: "es",
    },
  },
  {
    input: "./src/uMarks.mjs",
    output: {
      name: 'uMarks',
      file: "./dist/uMarks.iife.js",
      format: "iife",
    },
  },
  {
    input: "./src/uMarks.mjs",
    output: {
      name: 'uMarks',
      file: "./dist/uMarks.iife.min.js",
      format: "iife",
    },
    plugins: [
      terser(terserOpts),
    ],
  },
];
