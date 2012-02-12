/*global
	Components:false,
	window:false,
	ko:false,
*/
/*jslint white:false, bitwise:false, plusplus: false, regexp:false */
(function(global) {
	"use strict";
	
	var
		hooks = {},
		observerSvc = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService),
		o = {}
	;
	
	observerSvc.addObserver(o, "file_changed", false);
	o.observe = function(subject, topic, data) {
		if(topic === 'file_changed' && hooks[data]) {
			hooks[data]();
		}
	};

	// a singleton
	global.QuickdiffObserver = {
		
		/**
		 * A function that registers a callback that fires when a particular file changes.
		 * NB: only one callback per file.
		 */
		setHook: function(filePath, callback) {
			// local files come without protocol
			if(filePath.indexOf('/')===0) {
				filePath = "file://" + filePath;
			}
			//ko.logging.getLogger("extensions.quickdiff").warn("setHook: " + filePath);
			hooks[filePath] = callback;
		}
	};
}(this));
