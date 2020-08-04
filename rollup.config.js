import babel from '@rollup/plugin-babel';
import { DEFAULT_EXTENSIONS } from '@babel/core';
import external from 'rollup-plugin-peer-deps-external';
import commonjs from 'rollup-plugin-commonjs';
import scss from 'rollup-plugin-scss';
import json from 'rollup-plugin-json';
import url from 'rollup-plugin-url';
import resolve from 'rollup-plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';

import replace from 'rollup-plugin-replace';

import pkg from './package.json';

import process from 'process';
process.env.NODE_ENV = 'production';

const nodeModulesDirectory = 'node_modules/**';

const externalPackages = [
	'axios',
	'form-data',
	'isomorphic-ws',
	'lodash',
	'seamless-immutable',
	'uuid/v4',
	'base64-js',
	'@babel/runtime/regenerator',
	'@babel/runtime/helpers/asyncToGenerator',
	'@babel/runtime/helpers/objectWithoutProperties',
	'@babel/runtime/helpers/toConsumableArray',
	'@babel/runtime/helpers/objectSpread',
	'@babel/runtime/helpers/extends',
	'@babel/runtime/helpers/defineProperty',
	'@babel/runtime/helpers/assertThisInitialized',
	'@babel/runtime/helpers/inherits',
	'@babel/runtime/helpers/getPrototypeOf',
	'@babel/runtime/helpers/possibleConstructorReturn',
	'@babel/runtime/helpers/createClass',
	'@babel/runtime/helpers/classCallCheck',
	'@babel/runtime/helpers/slicedToArray',
	'@babel/runtime/helpers/typeof',
];

const browserIgnore = {
	name: 'browser-remapper',
	resolveId: importee =>
		['jsonwebtoken', 'http', 'https', 'crypto'].includes(importee) ? importee : null,
	load: id =>
		['jsonwebtoken', 'http', 'https', 'crypto'].includes(id)
			? 'export default null;'
			: null,
};

const baseConfig = {
	input: 'src/index.ts',
	cache: false,
	watch: {
		chokidar: false,
	},
};

const normalBundle = {
	...baseConfig,
	output: [
		{
			file: pkg.main,
			format: 'cjs',
			sourcemap: true,
		},
		{
			file: pkg.module,
			format: 'es',
			sourcemap: true,
		},
	],
	external: externalPackages.concat(['http', 'https', 'jsonwebtoken', 'crypto']),
	plugins: [
		resolve({ extensions: ['.js', '.ts'] }),
		replace({
			'process.env.NODE_ENV': JSON.stringify('production'),
		}),
		external(),
		babel({
			babelHelpers: 'runtime',
			exclude: nodeModulesDirectory,
			extensions: [...DEFAULT_EXTENSIONS, '.ts'],
		}),
		scss({
			output: pkg.style,
		}),
		commonjs(),
		url(),
		json(),
	],
};

const browserBundle = {
	...baseConfig,
	output: [
		{
			file: pkg.browser[pkg.main],
			format: 'cjs',
			sourcemap: true,
		},
		{
			file: pkg.browser[pkg.module],
			format: 'es',
			sourcemap: true,
		},
	],
	external: externalPackages,
	plugins: [
		resolve({ extensions: ['.js', '.ts'] }),
		replace({
			'process.env.NODE_ENV': JSON.stringify('production'),
		}),
		browserIgnore,
		external(),
		babel({
			babelHelpers: 'runtime',
			exclude: nodeModulesDirectory,
			extensions: [...DEFAULT_EXTENSIONS, '.ts'],
		}),
		scss({
			output: pkg.style,
		}),
		commonjs(),
		url(),
		json(),
	],
};

const fullBrowserBundle = {
	...baseConfig,
	output: [
		{
			file: pkg.jsdelivr,
			format: 'iife',
			name: 'window', // write all exported values to window
			extend: true, // extend window, not overwrite it
			sourcemap: true,
			browser: true,
		},
	],
	plugins: [
		resolve({ extensions: ['.js', '.ts'] }),
		replace({
			'process.env.NODE_ENV': JSON.stringify('production'),
		}),
		external(),
		babel({
			babelHelpers: 'runtime',
			exclude: nodeModulesDirectory,
			extensions: [...DEFAULT_EXTENSIONS, '.ts'],
		}),
		scss({
			output: pkg.style,
		}),
		browserIgnore,
		resolve({ browser: true }),
		commonjs(),
		url(),
		json(),
		terser(),
	],
};

export default () =>
	process.env.ROLLUP_WATCH
		? [normalBundle, browserBundle]
		: [normalBundle, browserBundle, fullBrowserBundle];
