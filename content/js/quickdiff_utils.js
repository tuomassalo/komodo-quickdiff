/*global
	Components:false,
	window:false,
	ko:false,
	*/
/*jslint
	white:false,
	bitwise:false,
	plusplus: false,
	regexp:false,
*/
(function(global) {
	"use strict";

	global.QuickdiffUtils = {
		
		/**
		 * runs the specified `cmd` shell command asyncronously, calling callback(retval, stdout) when finished.
		*/
		runAsync: function(cmd, callback) {
			var
				runSvc = Components.classes["@activestate.com/koRunService;1"].createInstance(Components.interfaces.koIRunService),
				process = runSvc.RunAndNotify(cmd,'','',''),
				tries = 0,
				waitTime = 50, // milliseconds
				finishedLoop
			;
			
			finishedLoop = function() {
				var retval, out;
				try {
					retval = process.wait(0);
				} catch(bogus) {
					// not finished yet
					if(tries++ > 10) {
						ko.logging.getLogger("extensions.quickdiff").warn("Command timed out: " + cmd);
						callback(-1); //err
					} else {
						waitTime *= 1.5;
						window.setTimeout(finishedLoop, waitTime);
					}
				}
				out = process.getStdout();
				callback(retval, out);
			};
			
			window.setTimeout(finishedLoop, waitTime);
		},
		
		/**
		 * Parses a unified diff output. Returns the diff as an array of changes (change "hunks"), such as:
		 *  {
		 *    firstLine: 42, // first affected line in the working copy
		 *    lastLine: 43, // last line affected in the working copy (redundant, but make the drawing and click detecting easier)
		 *    type // one of 'add','change','del' (also redundant)
		 *    "+": ["one added line\n", "another added line\n"], // added lines as an array; note line endings
		 *    "-": ["a removed line\n"] // removed lines
		 *  }
		 */
		parseUnifiedDiff: function(diffText) {
			var
				diffLines = diffText.match(/[^\n]+(?:\r?\n|$)/g), // see http://stackoverflow.com/a/9119239/95357
				reHunkStart = /^@@ -\d+(?:,\d+)? \+(\d+)/,
				reChanges = /^([\+\-\\])(.*\n)/,
				hunks = [], // the final output will be added here
				lineNumber = 0,
				line, // the text of current line
				match, // used for regexs
				hunk,
				prevMod, // '+' or '-' - used for EOF newline handling
				processLine = function(type, lineContents) {
					if(type==='\\') {
						// "\ No newline at end of file"
						prevMod[prevMod.length-1] = prevMod[prevMod.length-1].replace(/\n$/, "");
					} else {
						if(type==='-') {
							lineNumber--;
						}
						hunk[type].push(lineContents);
						prevMod = hunk[type];
					}
				}
			;
			
			
			// expect to have a diff of one file, so discard any lines regarding the file name
			
			while(/^(?:Index:|===|---|\+\+\+)/.test(diffLines[0])) {
				diffLines.shift();
			}
			
			while(diffLines.length) {
				lineNumber++;
				line = diffLines.shift();
				switch(line.charAt(0)) {
					case ' ':
						// skip contextual lines
						break;
					case '@':
						match = reHunkStart.exec(line);
						if(!match) {
							window.alert("Error[1] reading diff, line: " + line);
						}
						lineNumber = match[1] - 1;
						break;
					case '+':
					case '-':
						match = reChanges.exec(line);
						if(!match) {
							window.alert("Error[2] reading diff, line: " + line);
						}
				
						hunk = { firstLine: lineNumber, '+': [], '-': [] };
						
						processLine(match[1], match[2]);
						
						while(true) {
							match = reChanges.exec(diffLines[0]);
							if(!match) {
								break;
							}
							diffLines.shift();
							processLine(match[1], match[2]);
							lineNumber++;
						}
	
						// calculate lastLine and type
						if(hunk['+'].length === 0) {
							// deletions only
							hunk.type = 'del';
							hunk.lastLine = hunk.firstLine;
						} else {
							hunk.lastLine = hunk.firstLine + hunk['+'].length - 1;
							if(hunk['-'].length === 0) {
								// additions only
								hunk.type = 'add';
							} else {
								// adds and deletions
								hunk.type = 'change';
							}
						}
	
						hunks.push(hunk);
						break;
					case '\\':
						// a lonely '\ No newline at end of file' line: do nothing
						break;

					default:
						ko.logging.getLogger("extensions.quickdiff").warn("out:" + JSON.stringify({output: diffText}));
						window.alert("Error[3] reading diff, line: " + line + "\n\nSee the pystderr.log for details.");
				}
			}
			return hunks;
		},

		/**
		 * generate a temp file name
		 */
		tempName: function(suffix) {
			var
				tmpFileSvc = Components.classes["@activestate.com/koFileService;1"]
					.getService(Components.interfaces.koIFileService)
			;
			return tmpFileSvc.makeTempName(suffix);
		}
		
	};
}(this));
