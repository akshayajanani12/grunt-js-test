'use strict';

var path = require('path');

module.exports = function (grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),

		express: {
			server: {
				options: {
					port: 8981,
					server: path.resolve(__dirname, 'server.js')
				}
			}
		},

		mocha: {
			all: {
				options: {
					urls: ['test/*.unittests.html']
				}
			},
			options: {
				reporter: 'Spec',
				timeout: 20000
			}
		},

		jshint: {
			uses_defaults: [
				'gruntfile.js',
				'server.js',
				'lib/**/*.js',
			],
			options: {
				jshintrc: '.jshintrc',
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-express');
	grunt.loadNpmTasks('grunt-mocha');

	grunt.registerTask('testConnect', 'Test a connection to the js-test-env server.', function () {
		var done = this.async();

		function startServer() {
			grunt.task.run(['express']);
			done();
		}

		var express = grunt.config.get('express');

		// first make sure the web server is running
		require('http').get({
			host: express.server.options.hostname || 'localhost',
			port: express.server.options.port,
			path: '/alive',
			timeout: 30
		}, function (res) {
			if (res.statusCode === 200) {
				done();
			} else {
				startServer();
			}
		}).on('error', function () {
			startServer();
		});
	});

	grunt.registerTask('findTests', 'Locate all tests and generate an array of test URLs.', function (project) {
		var file = grunt.option('file');
		var config = grunt.config.get('mocha');
		project = project || grunt.option('project'); // project should be the project slug (set in projects.json)

		if (!project && file) {
			grunt.fail.warn('You must provide the project via --project=slug when providing a file to test');
			return;
		}

		var jenkins = !!grunt.option('jenkins');
		var projects = require('./lib/projects');
		var tests = [];

		// if a project is provided, only find the tests for that project
		if (project) {
			// ensure this project exists
			if (!projects[project]) {
				grunt.fail.warn('No project found by slug:', project);
				return;
			}

			grunt.verbose.write('Finding tests only for project:', project, '\n');
			project = projects[project];
			tests = project.tests(jenkins);
		}
		// if no project is provided, we test all projects
		else {
			projects.forEach(function (project) {
				tests = tests.concat(project.tests(jenkins));
			});
		}

		// filter: find a specific test file
		if (file) {
			grunt.verbose.write('Specific file provided:', file, '\n');
			tests = tests.filter(function (test) {
				return file.toLowerCase() === test.file.toLowerCase();
			});

			if (tests.length === 0) {
				grunt.fail.warn('Failed to find file by --file provided.');
				return;
			}
		}

		// filter: RegExp
		if (grunt.option('re')) {
			grunt.verbose.write('Applying RegEx filter:', grunt.option('re'), '\n');

			var re = new RegExp(grunt.option('re'), 'i');
			tests = tests.filter(function (test) {
				var pass = re.test(test.file);
				grunt.verbose.write('  ', test.file, '=', pass ? 'pass' : 'fail', '\n');
				return pass;
			});
		}

		// filter: simple contains
		if (grunt.option('search')) {
			var search = grunt.option('search');
			grunt.verbose.write('Applying simple filter:', search, '\n');

			tests = tests.filter(function (test) {
				var pass = test.file.toLowerCase().indexOf(search) !== -1;
				grunt.verbose.write('  ', test.file, '=', pass ? 'pass' : 'fail', '\n');
				return pass;
			});
		}

		// set the config for mocha passing the correct URLs to be used
		config.all.options.urls = tests.map(function (test) {
			return 'http://localhost:8981' + test.url;
		});

		// option: bail - exit on first error found
		if (grunt.option('bail') || jenkins) {
			config.all.options.bail = true;
		}

		// option: mocha-grep - grep within the test file, mocha does this
		if (grunt.option('mocha-grep')) {
			config.all.options.mocha = {
				grep: grunt.options('mocha-grep')
			};
		}

		grunt.config.set('mocha', config);
	});

	// run all the tests (or a single test, if the --file argument is used)
	grunt.registerTask('test', 'Run tests for a project.', function (project) {
		if (project) {
			grunt.task.run(['testConnect', 'findTests:' + project, 'mocha']);
		} else {
			grunt.task.run(['testConnect', 'findTests', 'mocha']);
		}
	});

	grunt.registerTask('test-all', 'Run all tests for all projects.', ['testConnect', 'findTests', 'mocha']);

	// start the express server with keepalive
	grunt.registerTask('server', 'Start server with keepalive.', ['express', 'express-keepalive']);
};