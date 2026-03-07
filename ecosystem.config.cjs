module.exports = {
	apps: [
		{
			name: 'titans-pit',
			cwd: __dirname,
			script: 'node',
			args: '--env-file=.env build',
			env: {
				NODE_ENV: 'production'
			}
		}
	]
};
