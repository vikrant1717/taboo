var npDebug = true;
var log = null;
var $ = function(x) { return document.getElementById(x); }
var tboPrefs = null;

function Taboo() {
  const CC = Components.classes;
  const CI = Components.interfaces;
  const SVC = CC['@oy/taboo;1'].getService(CI.oyITaboo);

  this.addTaboo = function(event) {
    if (event.shiftKey) {
      this.show();
    }
    else {
      SVC.save(null);
    }
  }
  this.show = function() {
    var url = gBrowser.selectedBrowser.webNavigation.currentURI.spec;
    if (url == 'about:blank' ||
        url == 'chrome://taboo/content/start.html') {
      openUILinkIn('chrome://taboo/content/start.html', 'current');
    }
    else {
      openUILinkIn('chrome://taboo/content/start.html', 'tab');
    }
  }
  
  tboInstallInToolbar();
}

var taboo;

function taboo_init() {
  if (npDebug) {
    if (typeof(console)=="undefined") {
      var t = Components.classes['@mozilla.org/consoleservice;1'].getService(Components.interfaces.nsIConsoleService)
      log = function(x) { t.logStringMessage(x); }
    }
    else {
      log = console.log;
    }
  }
  else {
    log = function(x) {};
  }
  tboPrefs = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);
  taboo = new Taboo();
}

window.addEventListener("load", taboo_init, true);

// Check whether we installed the toolbar button already and install if not
function tboInstallInToolbar() {
	// Make sure not to run this twice
	if (!tboPrefs.getPrefType("extensions.taboo.setup")) {
		if (!document.getElementById("taboo-toolbarbutton-add")) {
			var insertBeforeBtn = "urlbar-container";
			var toolbar = document.getElementById("nav-bar");
			if (toolbar && "insertItem" in toolbar) {
				var insertBefore = $(insertBeforeBtn);
				log(insertBefore);
				if (insertBefore && insertBefore.parentNode != toolbar)
					insertBefore = null;
	
				toolbar.insertItem("taboo-toolbarbutton-add", insertBefore, null, false);
				toolbar.insertItem("taboo-toolbarbutton-view", insertBefore, null, false);
					
				toolbar.setAttribute("currentset", toolbar.currentSet);
				document.persist(toolbar.id, "currentset");
			}
		}
		tboPrefs.setBoolPref("extensions.taboo.setup", true);
	}
}