/*global
	ko:false,
	Components:false,
	window:false,
	quickdiffFactory:false,
	QuickdiffUtils:false,
	QuickdiffObserver:false,
	*/
/*jslint
	white:false,
	bitwise:false,
	plusplus: false,
	regexp:false,
	nomen:false,
*/

var
	osType = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime).OS,
	osError = "Quick Diff: os '" + osType + "' not supported."
;
if(osType !== 'Linux' && osType !== 'Darwin') {
	// show OS error when the chrome has loaded
	window.setTimeout(function() {
		"use strict";
		window.alert(osError);
	}, 10000);
	throw osError;
}

(function(global) {
	"use strict";

	var
			quickdiff_view_property = 'QUICKDIFF_VIEW',
		QUICKDIFF_MARKERNUMBERS = { // scintilla marker numbers, see http://www.scintilla.org/ScintillaDoc.html#Markers
			add: 17,
			del: 18,
			change: 19
		},
		QUICKDIFF_MARKERMASK =
			1<<QUICKDIFF_MARKERNUMBERS.add |
			1<<QUICKDIFF_MARKERNUMBERS.del |
			1<<QUICKDIFF_MARKERNUMBERS.change,
		QUICKDIFF_MARGIN = 2,	// which scintilla margin to use
		
		/**
		 * when document content (possibly) changes, this is called without proper 'this' and for any view.
		 */
		requestRefreshCaller = function() {
			var self = ko.views.manager.currentView[quickdiff_view_property];
			if(self) {
				self._requestRefresh(1000);
			}
		},
		
		
		
		/**
		 * the constructor for view-specific stuff
		 */
		QuickdiffView = function(view) {
			
		// scimoz-specific initialization
			var
				self = this,
				mask = view.scimoz.getMarginMaskN(QUICKDIFF_MARGIN) | QUICKDIFF_MARKERMASK,
				origMarginClickHandler = view.onMarginClick,
				filePath = view.koDoc.displayPath,
				scimoz = view.scimoz
			;
			
			self.view = view;
			
			// TODO: better graphics?
			scimoz.markerSetFore(QUICKDIFF_MARKERNUMBERS.add,    0x00aa00); // green
			scimoz.markerSetFore(QUICKDIFF_MARKERNUMBERS.del,    0x0000ff); // red
			scimoz.markerSetFore(QUICKDIFF_MARKERNUMBERS.change, 0xff0000); // blue
			scimoz.setMarginMaskN(QUICKDIFF_MARGIN, mask);
			
			scimoz.markerDefine(QUICKDIFF_MARKERNUMBERS.add,    scimoz.SC_MARK_CHARACTER+("+".charCodeAt()));
			scimoz.markerDefine(QUICKDIFF_MARKERNUMBERS.del,    scimoz.SC_MARK_CHARACTER+("-".charCodeAt()));
			scimoz.markerDefine(QUICKDIFF_MARKERNUMBERS.change, scimoz.SC_MARK_CHARACTER+("*".charCodeAt()));
			
			// margin click handler
			self.view.onMarginClick = function(modifiers, position, margin) {
				var line = scimoz.lineFromPosition(position) + 1;
				if(margin === QUICKDIFF_MARGIN && scimoz.markerGet(line-1) & QUICKDIFF_MARKERMASK) {
	
					self._diffHunks.some(function(hunk) {
						if(hunk.firstLine <= line && line <= hunk.lastLine) {
							self._showHunkWindow(hunk);
							return true; // found; short-circuit
						} else {
							return false;
						}
					});
				}
				return origMarginClickHandler.call(this, modifiers, position, margin);
			};
			
			// refresh the diff when saving the file
			QuickdiffObserver.setHook(filePath, function() {
				self._requestRefresh(1);
				//window.alert("changed: " + filePath);
			});
			//alert(234);
			self._diffHandler = quickdiffFactory(filePath);
			
			self._requestRefresh(1); // right away (in 1 msec)
		},
		/**
		* when any view is activated, this is called.
		*/
		initCurrentView = function() {
			var view = ko.views.manager.currentView;

			/**
			 * If the view is not yet initialized AND the file has been saved, init!
			 */
			
			if(view && !view[quickdiff_view_property] && view.koDoc.displayPath.match('/')) {
				view[quickdiff_view_property] = new QuickdiffView(view);
			}
		}
	;

	QuickdiffView.prototype._clearAllMarkers = function() {
		var self = this;
		// in some cases, scimoz is not initialized yet. Never mind then.
		if(self.view.scimoz) {
			self.view.scimoz.markerDeleteAll(QUICKDIFF_MARKERNUMBERS.add);
			self.view.scimoz.markerDeleteAll(QUICKDIFF_MARKERNUMBERS.del);
			self.view.scimoz.markerDeleteAll(QUICKDIFF_MARKERNUMBERS.change);
		}
	};
	
	/**
	 * Remove diff markers regarding a single change (hunk)
	 */
	 
	QuickdiffView.prototype._clearHunkMarkers = function(hunk) {
		var
			self = this,
			scimoz = self.view.scimoz,
			line
		;
		for(line=hunk.firstLine; line<=hunk.lastLine; line++) {
			self.view.scimoz.markerDelete(line-1, QUICKDIFF_MARKERNUMBERS.add);
			self.view.scimoz.markerDelete(line-1, QUICKDIFF_MARKERNUMBERS.del);
			self.view.scimoz.markerDelete(line-1, QUICKDIFF_MARKERNUMBERS.change);
			
		}
	};
	
	// draw the diff markers to buffer margin
	QuickdiffView.prototype._drawMarkers = function() {
		var
			self = this,
			line
		;
		// (first, clear any earlier markers)
		self._clearAllMarkers();
	
		self._diffHunks.forEach(function(hunk) {
			for(line=hunk.firstLine; line<=hunk.lastLine; line++) {
				self.view.scimoz.markerAdd(line-1, QUICKDIFF_MARKERNUMBERS[hunk.type]);
			}
		});
	};

	/**
	 * _refreshAsync() updates the margin markers with current diff info. Calls callback() when finished.
	 */ 
	QuickdiffView.prototype._refreshAsync = function(callback) {
		
		var
			self = this,
			filenameWorkingCopy = QuickdiffUtils.tempName("quickdiff-working"),
			osSvc = Components.classes['@activestate.com/koOs;1'].getService(Components.interfaces.koIOs)
		;
		
		osSvc.writefile(filenameWorkingCopy, self.view.scimoz.text);
		
		QuickdiffUtils.runAsync(self._diffHandler.getBaseCmd() + " | diff -u - " + filenameWorkingCopy, function(retval, output) {
			
			if(output === '') {
				self._clearAllMarkers();
			} else {
				self._diffHunks = QuickdiffUtils.parseUnifiedDiff(output);
				self._drawMarkers();
				if(callback) {
					callback();
				}
			}
			// TODO: remove temp file(s)
			return false;
		});
	};
	
	// this is called when a quickdiff marker in the buffer margin is clicked
	QuickdiffView.prototype._showHunkWindow = function(hunk) {
		
		/**
		 *  This is a horrible kludge: window.openDialog works asyncronously, so we'll
		 *  have to wait for the window to load before adding content. Here we use a
		 *  clumsy polling system.
		 */
		
		var
			self = this,
			getDialog = function() {
				return window.openDialog("chrome://quickdiff/content/hunk.xul", "Quick Diff", "chrome");
			},
			dlg = getDialog(),
			initDlg = function() {
				var
					xulDoc = dlg.document,
					iframe = xulDoc.getElementById('quickdiffContentFrame').contentDocument,
					changesElem = iframe.getElementById('quickdiffChanges'),
					container = iframe.createDocumentFragment(),
				
					printLines = function(lines, className) {
						lines.forEach(function(line) {
							var
								p = iframe.createElement('p'),
								noNewline
							;
							p.className = className;
							if(!/\S/.test(line)) {
								// ensure that the bg color is shown even for empty lines
								line = '\u00a0' + line;
							}

							// convert tabs to spaces (yeah: buggy for tabs located elsewhere than tab stops)
							line = line.replace(/\t/g, new Array(self.view.scimoz.tabWidth+1).join(" "));
							p.appendChild(iframe.createTextNode(line));
							
							if(!/\n$/.test(line)) {
								noNewline = iframe.createElement('span');
								noNewline.appendChild(iframe.createTextNode(" (No newline at end of file)"));
								p.appendChild(noNewline);
							}
							container.appendChild(p);
						});
					},
					againstElem = iframe.getElementById('quickdiffAgainst')
				;
				
				xulDoc.getElementById('quickdiffButtonRevert').addEventListener('command', function(evt) {
					self._clearHunkMarkers(hunk); // avoid flicker
					self._revert(hunk);
					self._requestRefresh(1); // update the markers (right away, in 1 msec)
					getDialog().close();
				}, false);
				
				printLines(hunk['-'], 'del');
				printLines(hunk['+'], 'add');
				
				changesElem.innerHTML = ''; // remove previous content
				changesElem.appendChild(container);
				
				againstElem.innerHTML = '';
				againstElem.appendChild(iframe.createTextNode(self._diffHandler.getAgainstTitle()));
				
				dlg.focus();
			},
			preInitDlg
		;

		preInitDlg = function() {
			try {
				var
					foo = dlg.document.getElementById('quickdiffContentFrame').contentDocument.getElementById('quickdiffChanges').nodeName
				;
			} catch(err) {
				window.setTimeout(preInitDlg, 100);
				return;
			}
			try {
				initDlg();
			} catch(err2) {
				ko.logging.getLogger("extensions.quickdiff").warn("dialog error: " + err2);
			}
		};
		
		window.setTimeout(preInitDlg, 50);
	};
	
	/**
	 * Wait for the user to take at least a 1 second break, then start refreshing the markers.
	 */
	QuickdiffView.prototype._requestRefresh = function(timeout) {
		var
			self = this,
			callRefresh
		;
		
		callRefresh = function() {
				self._waiting = false;
				if(self._refreshing) {
					// another refreshing command is already executing: wait some more.
					self._waiting = window.setTimeout(callRefresh, 1000);
				} else {
					self._refreshAsync(function() {
						 // refresh done
						self._refreshing = false;
					});
				}
			}
		;

		if(self._waiting) {
			// if already waiting for the user take a break, wait more (postpone drawing)
			window.clearTimeout(self._waiting);
		}
		
		self._waiting = window.setTimeout(callRefresh, timeout);
	};

	// revert one change (hunk)
	QuickdiffView.prototype._revert = function(hunk) {
		var
			self = this,
			i,
			adds
		;
		
		self.view.scimoz.beginUndoAction();
		self.view.scimoz.gotoLine(hunk.firstLine-1);
		for(i=0; i<hunk['+'].length; i++) {
			self.view.scimoz.lineCut();
		}
		adds = hunk['-'].join("");
		
		self.view.scimoz.insertText(self.view.scimoz.positionFromLine(hunk.firstLine-1), adds);
		self.view.scimoz.endUndoAction();
	};
	
	
	///// initialize	
	
	// call removeEventListener() just for safety
	
	window.removeEventListener('current_view_changed', initCurrentView, false);
	window.addEventListener   ('current_view_changed', initCurrentView, false);

	window.removeEventListener('view_document_attached', initCurrentView, false);
	window.addEventListener   ('view_document_attached', initCurrentView, false);

	window.removeEventListener('view_opened', initCurrentView, false);
	window.addEventListener   ('view_opened', initCurrentView, false);

	window.removeEventListener('current_view_check_status', requestRefreshCaller, false);
	window.addEventListener   ('current_view_check_status', requestRefreshCaller, false);
			
	initCurrentView();
	
}(this));

