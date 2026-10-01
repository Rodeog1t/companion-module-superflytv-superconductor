import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: true,
	ignores: ['**/dist-test/*'],
})

export default [
	...baseConfig,
	{
		// The describe() and test() functions of node:test return promises that are not meant to be awaited
		files: ['src/__tests__/*.ts'],
		rules: {
			'@typescript-eslint/no-floating-promises': 'off',
		},
	},
]
