/*
 * Copyright 2007 Jesse Andrews and Manish Singh
 *  
 * This file may be used under the terms of of the
 * GNU General Public License Version 2 or later (the "GPL"),
 * http://www.gnu.org/licenses/gpl.html
 *  
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 */

const TB_CONTRACTID = '@oy/taboo;1';
const TB_CLASSID    = Components.ID('{962a9516-b177-4083-bbe8-e10f47cf8570}');
const TB_CLASSNAME  = 'Taboo Service';


const Cc = Components.classes;
const Ci = Components.interfaces; 
const Cr = Components.results;
const Cu = Components.utils;

/* from nspr's prio.h */
const PR_RDONLY      = 0x01;
const PR_WRONLY      = 0x02;
const PR_RDWR        = 0x04;
const PR_CREATE_FILE = 0x08;
const PR_APPEND      = 0x10;
const PR_TRUNCATE    = 0x20;
const PR_SYNC        = 0x40;
const PR_EXCL        = 0x80;

const CAPABILITIES = [
  "Subframes", "Plugins", "Javascript", "MetaRedirects", "Images"
];


function getObserverService() {
  return Cc['@mozilla.org/observer-service;1']
    .getService(Ci.nsIObserverService);
}

function getBoolPref(prefName, defaultValue) {
  try {
    var prefs = Cc['@mozilla.org/preferences-service;1']
      .getService(Ci.nsIPrefBranch);
    return prefs.getBoolPref(prefName);
  }
  catch (e) {
    return defaultValue;
  }
}


/* MD5 wrapper */
function hex_md5_stream(stream) {   
  var hasher = Components.classes["@mozilla.org/security/hash;1"]
    .createInstance(Components.interfaces.nsICryptoHash);
  hasher.init(hasher.MD5);

  hasher.updateFromStream(stream, stream.available());
  var hash = hasher.finish(false);

  var ret = '';
  for (var i = 0; i < hash.length; ++i) {
    var hexChar = hash.charCodeAt(i).toString(16);
    if (hexChar.length == 1)
      ret += '0';
    ret += hexChar;
  }

  return ret;
}

function hex_md5(s) {
  var stream = Components.classes["@mozilla.org/io/string-input-stream;1"]
    .createInstance(Components.interfaces.nsIStringInputStream);
  stream.setData(s, s.length);

  return hex_md5_stream(stream);
}


/*
 * Taboo Info Instance
 */

function TabooInfo() {
}

TabooInfo.prototype = {
  title: "",
  url: "",
  description: null,
  imageURL: "",
  created: null,
  updated: null,
  QueryInterface: function(iid) {
    if (!iid.equals(Ci.nsISupports) &&
        !iid.equals(Ci.oyITabooInfo)) {
      throw Cr.NS_ERROR_NO_INTERFACE;
    }
    return this;
  }
}

/*
 * Taboo Service Component
 */


function snapshot() {
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
  var win = wm.getMostRecentWindow('navigator:browser');
  var content = win.content;

  var canvas = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");

  var realW = content.innerWidth;
  var realH = content.innerHeight;

  var pW = 125.0/realW;
  var pH = 125.0/realH;

  var p = pW;

  if (pH < pW) {
    p = pH;
  }

  var w = p * realW;
  var h = p * realH;

  canvas.setAttribute("width", Math.floor(w));
  canvas.setAttribute("height", Math.floor(h));
  
  var ctx = canvas.getContext("2d");
  ctx.scale(p, p);
  ctx.drawWindow(content, content.scrollX, content.scrollY, content.innerWidth, content.innerHeight, "rgb(0,0,0)");

  return [win, canvas];
}

function TabooStorageFS() {
  this._tabooDir = Cc['@mozilla.org/file/directory_service;1']
    .getService(Ci.nsIProperties).get('ProfD', Ci.nsILocalFile);
  this._tabooDir.append('taboo');

  if (!this._tabooDir.exists())
    this._tabooDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0700);

  this._tabooFile = this._tabooDir.clone();
  this._tabooFile.append('taboo.js');

  this._loadState();
}

TabooStorageFS.prototype = {
  save: function TSFS_save(url, data, preview) {
    this._data[url] = data;
    this._saveState();

    try {
      var file = this._getPreviewFile(url);

      var ostream = Cc['@mozilla.org/network/file-output-stream;1']
        .createInstance(Ci.nsIFileOutputStream);
      ostream.init(file, PR_WRONLY | PR_CREATE_FILE | PR_TRUNCATE, 0600, 0);

      ostream.write(preview, preview.length);
      ostream.close();
    }
    catch (e) { }
  },
  delete: function TSFS_delete(url) {
    try {
      var file = this._getPreviewFile(url);
      file.remove(false);
    }
    catch (e) { }

    delete this._data[url];
    this._saveState();
  },
  retrieve: function TSFS_retrieve(url) {
    var file = this._getPreviewFile(url);

    var ios = Cc['@mozilla.org/network/io-service;1']
      .getService(Ci.nsIIOService);
    var fileHandler = ios.getProtocolHandler('file')
      .QueryInterface(Ci.nsIFileProtocolHandler);
    var previewURL = fileHandler.getURLSpecFromFile(file);

    return [this._data[url], previewURL];
  },
  getURLs: function TSFS_getURLs() {
    var urls = [];
    for (var url in this._data)
      urls.push(url);
    return urls;
  },
  _getPreviewFile: function TSFS__getPreviewFile(url) {
    var id = hex_md5(url);
    var file = this._tabooDir.clone();
    file.append(id + '.png');
    return file;
  },
  _saveState: function TSFS__saveState() {
    try {
      var file = this._tabooFile;

      var ostream = Cc['@mozilla.org/network/safe-file-output-stream;1']
        .createInstance(Ci.nsIFileOutputStream);
      ostream.init(file, PR_WRONLY | PR_CREATE_FILE | PR_TRUNCATE, 0600, 0);

      var converter = Cc['@mozilla.org/intl/scriptableunicodeconverter']
        .createInstance(Ci.nsIScriptableUnicodeConverter);
      converter.charset = 'UTF-8';

      var data = this._data.toSource();
      var convdata = converter.ConvertFromUnicode(data) + converter.Finish();

      ostream.write(convdata, convdata.length);

      if (ostream instanceof Ci.nsISafeOutputStream) {
        ostream.finish();
      } else {
        ostream.close();
      }
    }
    catch (e) { }
  },
  _loadState: function TSFS__loadState() {
    try { 
      var file = this._tabooFile;
 
      var stream = Cc['@mozilla.org/network/file-input-stream;1']
          .createInstance(Ci.nsIFileInputStream);
      stream.init(file, PR_RDONLY, 0, 0);

      var cvstream = Cc['@mozilla.org/intl/converter-input-stream;1']
        .createInstance(Ci.nsIConverterInputStream);
      cvstream.init(stream, 'UTF-8', 1024,
                    Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

      var content = '';
      var data = {};
      while (cvstream.readString(4096, data)) {
        content += data.value;
      }

      cvstream.close();

      content = content.replace(/\r\n?/g, '\n');

      var sandbox = new Cu.Sandbox('about:blank');
      this._data = Cu.evalInSandbox(content, sandbox);
    }
    catch (e) {
      this._data = {};
    }
  },
}


function TabooService() {
  var obs = getObserverService();
  obs.addObserver(this, 'profile-after-change', false);
}

TabooService.prototype = {
  _init: function TB__init() {
    this._storage = new TabooStorageFS();
  },
  observe: function TB_observe(subject, topic, state) {
    var obs = getObserverService();

    switch (topic) {
      case 'profile-after-change':
        obs.removeObserver(this, 'profile-after-change');
        this._init();
        break;
    }
  },

  save: function TB_save(aDescription) {
    var win, canvas;
    [win, canvas] = snapshot();

    var tabbrowser = win.getBrowser();
    var selectedBrowser = tabbrowser.selectedBrowser;

    var currentTab = -1;
    var browsers = tabbrowser.browsers;
    for (var i = 0; i < browsers.length; i++) {
      if (browsers[i] == selectedBrowser)
        currentTab = i;
    }

    if (currentTab == -1)
      return false;

    var ss = Cc['@mozilla.org/browser/sessionstore;1']
      .getService(Ci.nsISessionStore);
    var winJSON = "(" + ss.getWindowState(win) + ")";

    var sandbox = new Cu.Sandbox('about:blank');
    var winState = Cu.evalInSandbox(winJSON, sandbox);

    var state = winState.windows[0].tabs[currentTab];

    var previewData = canvas.toDataURL();
    var preview = win.atob(previewData.substr('data:image/png;base64,'.length));

    var url = selectedBrowser.currentURI.spec;

    var oldData, oldPreview;
    [oldData, oldPreview] = this._storage.retrieve(url);

    if (oldData && oldData.taboo) {
      var tabooState = oldData.taboo;
      tabooState.updated = new Date();
      if (aDescription != null)
        tabooState.description = aDescription;
    } else {
      var now = new Date();
      var tabooState = { description: aDescription,
                         created:     now,
                         updated:     now
                       };
    }

    state.taboo = tabooState;

    this._storage.save(url, state, preview);

    return true;
  },
  delete: function TB_delete(aURL) {
    this._storage.delete(aURL);
  },
  get: function TB_get(filter) {
    var urls = this._storage.getURLs();

    var enumerator = {
      _urls: urls,
      _storage: this._storage,
      getNext: function() {
        var url = this._urls.shift();

        var data, imageURL;
        [data, imageURL] = this._storage.retrieve(url);

        var tab = new TabooInfo();
        tab.url = url;
        tab.title = data.entries[data.index - 1].title;
        tab.imageURL = imageURL;
        tab.created = data.taboo.created;
        tab.updated = data.taboo.updated;
        return tab;
      },
      hasMoreElements: function() {
        return this._urls.length > 0;
      }
    }

    return enumerator;
  },

  /* Because sessionstore doesn't let us restore a single tab, we cut'n'paste
   * a bunch of code here
   */
  open: function TB_open(aURL, aWhere) {
    var tabData, imageURL;
    [tabData, imageURL] = this._storage.retrieve(aURL);

    // helper hash for ensuring unique frame IDs
    var idMap = { used: {} };

    var wm = Cc['@mozilla.org/appshell/window-mediator;1']
      .getService(Ci.nsIWindowMediator);
    var win = wm.getMostRecentWindow('navigator:browser');

    var loadInBackground = getBoolPref("browser.tabs.loadBookmarksInBackground", false);

    var tabbrowser = win.getBrowser();

    var tab;
    switch (aWhere) {
      case 'current':
        tab = tabbrowser.mCurrentTab;
        break;
      case 'tabshifted':
        loadInBackground = !loadInBackground;
        // fall through
      case 'tab':
        tab = tabbrowser.loadOneTab('about:blank', null, null, null,
                                    loadInBackground, false);
        break;
      default:
        return;
    }

    var _this = this;

    var browser = win.getBrowser().getBrowserForTab(tab);
    var history = browser.webNavigation.sessionHistory;

    if (history.count > 0) {
      history.PurgeHistory(history.count);
    }
    history.QueryInterface(Ci.nsISHistoryInternal);

    browser.markupDocumentViewer.textZoom = parseFloat(tabData.zoom || 1);

    for (var i = 0; i < tabData.entries.length; i++) {
      history.addEntry(this._deserializeHistoryEntry(tabData.entries[i], idMap), true);
    }

    // make sure to reset the capabilities and attributes, in case this tab gets reused
    var disallow = (tabData.disallow)?tabData.disallow.split(","):[];
    CAPABILITIES.forEach(function(aCapability) {
      browser.docShell["allow" + aCapability] = disallow.indexOf(aCapability) == -1;
    });
    Array.filter(tab.attributes, function(aAttr) {
      return (_this.xulAttributes.indexOf(aAttr.name) > -1);
    }).forEach(tab.removeAttribute, tab);
    if (tabData.xultab) {
      tabData.xultab.split(" ").forEach(function(aAttr) {
        if (/^([^\s=]+)=(.*)/.test(aAttr)) {
          tab.setAttribute(RegExp.$1, decodeURI(RegExp.$2));
        }
      });
    }

    // notify the tabbrowser that the tab chrome has been restored
    var event = win.document.createEvent("Events");
    event.initEvent("SSTabRestoring", true, false);
    tab.dispatchEvent(event);

    var activeIndex = (tabData.index || tabData.entries.length) - 1;
    try {
      browser.webNavigation.gotoIndex(activeIndex);
    }
    catch (ex) { } // ignore an invalid tabData.index

    // restore those aspects of the currently active documents
    // which are not preserved in the plain history entries
    // (mainly scroll state and text data)
    browser.__SS_restore_data = tabData.entries[activeIndex] || {};
    browser.__SS_restore_text = tabData.text || "";
    browser.__SS_restore_tab = tab;
    browser.__SS_restore = this.restoreDocument_proxy;
    browser.addEventListener("load", browser.__SS_restore, true);
  },
  _deserializeHistoryEntry: function TB__deserializeHistoryEntry(aEntry, aIdMap) {
    var shEntry = Cc["@mozilla.org/browser/session-history-entry;1"].
                  createInstance(Ci.nsISHEntry);
    
    var ioService = Cc["@mozilla.org/network/io-service;1"].
                    getService(Ci.nsIIOService);
    shEntry.setURI(ioService.newURI(aEntry.url, null, null));
    shEntry.setTitle(aEntry.title || aEntry.url);
    shEntry.setIsSubFrame(aEntry.subframe || false);
    shEntry.loadType = Ci.nsIDocShellLoadInfo.loadHistory;
    
    if (aEntry.cacheKey) {
      var cacheKey = Cc["@mozilla.org/supports-PRUint32;1"].
                     createInstance(Ci.nsISupportsPRUint32);
      cacheKey.data = aEntry.cacheKey;
      shEntry.cacheKey = cacheKey;
    }
    if (aEntry.ID) {
      // get a new unique ID for this frame (since the one from the last
      // start might already be in use)
      var id = aIdMap[aEntry.ID] || 0;
      if (!id) {
        for (id = Date.now(); aIdMap.used[id]; id++);
        aIdMap[aEntry.ID] = id;
        aIdMap.used[id] = true;
      }
      shEntry.ID = id;
    }
    
    var scrollPos = (aEntry.scroll || "0,0").split(",");
    scrollPos = [parseInt(scrollPos[0]) || 0, parseInt(scrollPos[1]) || 0];
    shEntry.setScrollPosition(scrollPos[0], scrollPos[1]);
    
    if (aEntry.postdata) {
      var stream = Cc["@mozilla.org/io/string-input-stream;1"].
                   createInstance(Ci.nsIStringInputStream);
      stream.setData(aEntry.postdata, -1);
      shEntry.postData = stream;
    }
    
    if (aEntry.children && shEntry instanceof Ci.nsISHContainer) {
      for (var i = 0; i < aEntry.children.length; i++) {
        shEntry.AddChild(this._deserializeHistoryEntry(aEntry.children[i], aIdMap), i);
      }
    }
    
    return shEntry;
  },
  restoreDocument_proxy: function TB_restoreDocument_proxy(aEvent) {
    // wait for the top frame to be loaded completely
    if (!aEvent || !aEvent.originalTarget || !aEvent.originalTarget.defaultView || aEvent.originalTarget.defaultView != aEvent.originalTarget.defaultView.top) {
      return;
    }
    
    var textArray = this.__SS_restore_text ? this.__SS_restore_text.split(" ") : [];
    function restoreTextData(aContent, aPrefix) {
      textArray.forEach(function(aEntry) {
        if (/^((?:\d+\|)*)(#?)([^\s=]+)=(.*)$/.test(aEntry) && (!RegExp.$1 || RegExp.$1 == aPrefix)) {
          var document = aContent.document;
          var node = RegExp.$2 ? document.getElementById(RegExp.$3) : document.getElementsByName(RegExp.$3)[0] || null;
          if (node && "value" in node) {
            node.value = decodeURI(RegExp.$4);
            
            var event = document.createEvent("UIEvents");
            event.initUIEvent("input", true, true, aContent, 0);
            node.dispatchEvent(event);
          }
        }
      });
    }
    
    function restoreTextDataAndScrolling(aContent, aData, aPrefix) {
      restoreTextData(aContent, aPrefix);
      if (aData.innerHTML) {
        aContent.setTimeout(function(aHTML) { if (this.document.designMode == "on") { this.document.body.innerHTML = aHTML; } }, 0, aData.innerHTML);
      }
      if (aData.scroll && /(\d+),(\d+)/.test(aData.scroll)) {
        aContent.scrollTo(RegExp.$1, RegExp.$2);
      }
      for (var i = 0; i < aContent.frames.length; i++) {
        if (aData.children && aData.children[i]) {
          restoreTextDataAndScrolling(aContent.frames[i], aData.children[i], i + "|" + aPrefix);
        }
      }
    }
    
    var content = XPCNativeWrapper(aEvent.originalTarget).defaultView;
    if (this.currentURI.spec == "about:config") {
      // unwrap the document for about:config because otherwise the properties
      // of the XBL bindings - as the textbox - aren't accessible (see bug 350718)
      content = content.wrappedJSObject;
    }
    restoreTextDataAndScrolling(content, this.__SS_restore_data, "");
    
    // notify the tabbrowser that this document has been completely restored
    var event = this.ownerDocument.createEvent("Events");
    event.initEvent("SSTabRestored", true, false);
    this.__SS_restore_tab.dispatchEvent(event);
    
    this.removeEventListener("load", this.__SS_restore, true);
    delete this.__SS_restore_data;
    delete this.__SS_restore_text;
    delete this.__SS_restore_tab;
  },
  xulAttributes: [],

  getInterfaces: function TB_getInterfaces(countRef) {
    var interfaces = [Ci.oyITaboo, Ci.nsIObserver, Ci.nsISupports];
    countRef.value = interfaces.length;
    return interfaces;
  },
  getHelperForLanguage: function TB_getHelperForLanguage(language) {
    return null;
  },
  contractID: TB_CONTRACTID,
  classDescription: TB_CLASSNAME,
  classID: TB_CLASSID,
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: Ci.nsIClassInfo.SINGLETON,

  QueryInterface: function TB_QueryInterface(iid) {
    if (iid.equals(Ci.oyITaboo) ||
        iid.equals(Ci.nsIObserver) ||
        iid.equals(Ci.nsISupports))
      return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  }
}

function GenericComponentFactory(ctor) {
  this._ctor = ctor;
}

GenericComponentFactory.prototype = {

  _ctor: null,

  // nsIFactory
  createInstance: function(outer, iid) {
    if (outer != null)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return (new this._ctor()).QueryInterface(iid);
  },

  // nsISupports
  QueryInterface: function(iid) {
    if (iid.equals(Ci.nsIFactory) ||
        iid.equals(Ci.nsISupports))
      return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  },
};

var Module = {
  QueryInterface: function(iid) {
    if (iid.equals(Ci.nsIModule) ||
        iid.equals(Ci.nsISupports))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  getClassObject: function(cm, cid, iid) {
    if (!iid.equals(Ci.nsIFactory))
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;

    if (cid.equals(TB_CLASSID))
      return new GenericComponentFactory(TabooService)

    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  registerSelf: function(cm, file, location, type) {
    var cr = cm.QueryInterface(Ci.nsIComponentRegistrar);
    cr.registerFactoryLocation(TB_CLASSID, TB_CLASSNAME, TB_CONTRACTID,
                               file, location, type);

    var catman = Cc['@mozilla.org/categorymanager;1']
      .getService(Ci.nsICategoryManager);
    catman.addCategoryEntry('app-startup', TB_CLASSNAME,
                            'service,' + TB_CONTRACTID,
                            true, true);
  },

  unregisterSelf: function(cm, location, type) {
    var cr = cm.QueryInterface(Ci.nsIComponentRegistrar);
    cr.unregisterFactoryLocation(TB_CLASSID, location);
  },

  canUnload: function(cm) {
    return true;
  },
};

function NSGetModule(compMgr, fileSpec)
{
  return Module;
}