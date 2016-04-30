'use strict';

var aFrom          = require('es5-ext/array/from')
  , forEach        = require('es5-ext/object/for-each')
  , ensureIterable = require('es5-ext/iterable/validate-object')
  , deferred       = require('deferred')
  , spawn          = require('child_process').spawn

  , isColorArg = RegExp.prototype.test.bind(/^--(?:no)?color$/)
  , isHeadingArg = RegExp.prototype.test.bind(/^-(?:H|-(?:no)?heading)$/);

module.exports = function (args) {
	var ag, def, map, currentName, currentData, init, cont, brokenLine;
	args = (args == null) ? [] : aFrom(ensureIterable(args));

	// Force default colors and headings (if not instructed otherwise)
	// As we pipe data through this util, 'ag' detects its not a terminal
	// and forces no colors and no headings. Adding below args reverts that behavior
	if (!args.some(isColorArg)) args.push('--color');
	if (!args.some(isHeadingArg)) args.push('-H');

	ag = spawn('ag', args);
	def = deferred();
	map = {};

	init = function (data) {
		// Data for new file
		currentData = [];
		currentName = data.shift();
		if (data.length) cont(data);
	};
	cont = function (data) {
		// Continue gather of data
		data.some(function (line, index) {
			if (line) {
				currentData.push(line);
				return;
			}
			map[currentName] = currentData.join('\n');
			currentData = null;
			data = data.slice(index + 1);
			if (data.length) init(data);
			return true;
		});
	};

	ag.stdout.on('data', function (data) {
		data = String(data).split('\n');
		if (brokenLine) data[0] = brokenLine + data[0];
		brokenLine = data.pop();
		if (!currentData) init(data);
		else cont(data);
	});

	ag.stderr.on('data', function (data) { def.promise.emit('err', data); });

	ag.on('error', def.reject);

	ag.on('close', function () {
		var result = [];
		if (brokenLine) {
			if (!currentData) init([brokenLine]);
			else cont([brokenLine]);
		}
		if (currentData) {
			map[currentName] = currentData.join('\n');
			currentData = null;
		}
		// Sort per filename
		forEach(map, function (out, name) {
			result.push(name + '\n' + out);
		}, null, function (a, b) { return a.localeCompare(b); });
		def.resolve(result.join('\n\n') + '\n');
	});

	return def.promise;
};
