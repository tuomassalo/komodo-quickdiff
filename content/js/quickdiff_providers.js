/*global
	ko:false,
	Components:false,
	window:false,
	quickdiffFactory:true,
	QuickdiffUtils:false,
	*/
/*jslint
	white:false,
	bitwise:false,
	plusplus: false,
	regexp:false,
	nomen:false,
*/

/**
 * This file contains implementations for retrieving the 'base version' of the file (from disk or VCS).
 * QuickdiffView calls the factory that returns the most suitable class.
 *
 * NB: the 'filename' param is eg. /foo/bar/baz.ext for local files, sftp://server/foo/bar/baz.ext for remote.
 */

function quickdiffFactory(filename) {
	"use strict";

	// mixin pattern, see eg. http://javascriptweblog.wordpress.com/2011/05/31/a-fresh-look-at-javascript-mixins/
	var
		i,
		provider,
		os = Components.classes['@activestate.com/koOs;1'].getService(Components.interfaces.koIOs),
		shellEsc = function(path) {
			return "'" + path.replace(/([\\'])/g, "\\$1") + "'";
		},
		reRemoteFile = /^sftp:\/\/([^\/]+)(\/.*)/,
		asLocal = function() {
			
			this._runCommand = function(cmd) {
				var
					runSvc = Components.classes["@activestate.com/koRunService;1"].createInstance(Components.interfaces.koIRunService),
					process = runSvc.RunAndNotify(cmd,'','',''),
					retval = process.wait(-1),
					ret
				;
				
				ret = process.getStdout();
				QuickdiffUtils.dbg("_asLocal _runCommand", {
					cmd: cmd,
					retval: retval,
					stdout: ret,
					stderr: process.getStderr()
				});
				return ret;
			};
			
			this.getBaseCmd = function() { return this._getBaseCmd(); };
			
			this.accept = function() {
				var match = reRemoteFile.exec(filename);
				if(match) {
					// not a local file
					return false;
				} else {
					this.filename = filename;
					this.dirname = os.path.dirname(filename);
					this.basename = os.path.basename(filename);

					return this._acceptType();
				}
			};
			this.refresh = function() {};
			this.getAgainstTitle = function() { return this._getAgainstTitle() + "."; };
			return this;
		},
		
		/////////////////////////////
		asRemote = function() {
			
			this._runCommand = function(cmd) {

				var
					remoteConnectionSvc = Components.classes["@activestate.com/koRemoteConnectionService;1"].
						getService(Components.interfaces.koIRemoteConnectionService),
					conn = remoteConnectionSvc.getConnectionUsingUri(filename),
					msg = "SSH error",
					stdout = {},
					stderr = {}, // not used
					retval // not used
				;
				
				if(conn) {
						// Ensure it's a SSH connection
						conn.QueryInterface(Components.interfaces.koISSHConnection);
				} else {
					window.alert(msg);
					throw msg;
				}
				retval = conn.runCommand(cmd, false, stdout, stderr);
				QuickdiffUtils.dbg("_asLocal _runCommand", {
					cmd: cmd,
					retval: retval,
					stdout: stdout,
					stderr: stderr
				});
				return stdout.value;
			};
			
			this.getBaseCmd = function() {
				var
					baseTempFilename = QuickdiffUtils.tempName("quickdiff-svn-base"),
					baseTempContents = this._runCommand(this._getBaseCmd())
				;
				os.writefile(baseTempFilename, baseTempContents);
				return "cat " + shellEsc(baseTempFilename);
			};
			
			this.accept = function() {
				var match = reRemoteFile.exec(filename);
				if(match) {
					this.remoteServer = match[1];
					this.filename = match[2];
					this.dirname = os.path.dirname(this.filename);
					this.basename = os.path.basename(this.filename);
					return this._acceptType();
				} else {
					// not a remote file
					return false;
				}
			};
			this.refresh = function() {};
			this.getAgainstTitle = function() { return this._getAgainstTitle() + " (on server " + this.remoteServer + ")."; };
			return this;
		},
		
		asFile = function() {
		  this._getAgainstTitle = function() { return "Diffing against saved file"; };
			this._acceptType = function() { return true; };
			this._getBaseCmd = function() {
				return "cat " + shellEsc(this.filename);
			};
		  return this;
		},
		
		asGit = function() {
			this._acceptType = function() {
				var
					found = this._runCommand('cd ' + shellEsc(this.dirname) + ' && git status')
				;
				return found ? true : false;
			};
		  this._getAgainstTitle = function() { return "Diffing against pristine git copy"; };
			this._getBaseCmd = function() {
				return "cd '" + shellEsc(this.dirname) + "' && git show HEAD:`git ls-files --full-name " + shellEsc(this.basename) +"`";
			};
		  return this;
		},
		
		asSvn = function() {
			this._acceptType = function() {
				var
					found = this._runCommand('cd ' + shellEsc(this.dirname) + ' && svn info')
				;
				return found ? true : false;
			};
		  this._getAgainstTitle = function() { return "Diffing against pristine SVN copy"; };
			this._getBaseCmd = function() {
				return "svn cat " + shellEsc(this.filename);
			};
		  return this;
		},
		
		providers = []
	;		
	
	// build prototypes for each type
	providers.push(function() {});
	providers.push(function() {});
	providers.push(function() {});
	providers.push(function() {});
	providers.push(function() {});
	providers.push(function() {});
	
	asLocal.call( providers[0].prototype);
	asLocal.call( providers[1].prototype);
	asLocal.call( providers[2].prototype);
	asRemote.call(providers[3].prototype);
	asRemote.call(providers[4].prototype);
	asRemote.call(providers[5].prototype);
	
	asGit.call( providers[0].prototype);
	asSvn.call( providers[1].prototype);
	asFile.call(providers[2].prototype);
	
	asGit.call( providers[3].prototype);
	asSvn.call( providers[4].prototype);
	asFile.call(providers[5].prototype);

	// the factory
	for(i=0; i<providers.length; i++) {
		QuickdiffUtils.dbg("trying provider", {'#': i, filename: filename});

		try {
			provider = new providers[i]();
			provider.accept();
			if(provider.accept()) {
				QuickdiffUtils.dbg("provider chosen: " + provider.getAgainstTitle());
				return provider;
			}
		} catch(err) {
			QuickdiffUtils.dbg("provider threw an exception: " + err);
		}
	}
	QuickdiffUtils.dbg("no diff provider found");
	// shouldn't reach this line
	return null;
}	
