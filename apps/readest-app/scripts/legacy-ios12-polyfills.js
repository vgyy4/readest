// biome-ignore-all lint: written in the old style on purpose, to run in Safari 12 as it is
/*
 * The few things the app uses that Safari 12 (iOS 12) does not have and core-js does not supply.
 * Written for Safari 12 itself: no optional chaining, no class fields.
 */
(function () {
  var w = window;

  // crypto.randomUUID (Safari 15.4)
  if (w.crypto && !w.crypto.randomUUID) {
    w.crypto.randomUUID = function () {
      var bytes = new Uint8Array(16);
      w.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 16; i++) hex.push((bytes[i] + 0x100).toString(16).slice(1));
      return (
        hex.slice(0, 4).join('') +
        '-' +
        hex.slice(4, 6).join('') +
        '-' +
        hex.slice(6, 8).join('') +
        '-' +
        hex.slice(8, 10).join('') +
        '-' +
        hex.slice(10).join('')
      );
    };
  }

  // Blob.arrayBuffer / text (Safari 14)
  if (w.Blob && !Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      var blob = this;
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(reader.result);
        };
        reader.onerror = function () {
          reject(reader.error);
        };
        reader.readAsArrayBuffer(blob);
      });
    };
  }
  if (w.Blob && !Blob.prototype.text) {
    Blob.prototype.text = function () {
      var blob = this;
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(reader.result);
        };
        reader.onerror = function () {
          reject(reader.error);
        };
        reader.readAsText(blob);
      });
    };
  }

  // new EventTarget() (Safari 14)
  try {
    new EventTarget();
  } catch (e) {
    var Native = w.EventTarget;
    var Shim = function EventTarget() {
      var node = document.createDocumentFragment();
      this.addEventListener = node.addEventListener.bind(node);
      this.removeEventListener = node.removeEventListener.bind(node);
      this.dispatchEvent = node.dispatchEvent.bind(node);
    };
    Shim.prototype = Native.prototype;
    w.EventTarget = Shim;
  }

  // BroadcastChannel (Safari 15.4): a channel that reaches nobody, so the code that tells other
  // tabs about a change simply has no other tabs to tell.
  if (!w.BroadcastChannel) {
    w.BroadcastChannel = function BroadcastChannel(name) {
      this.name = name;
      this.onmessage = null;
    };
    w.BroadcastChannel.prototype.postMessage = function () {};
    w.BroadcastChannel.prototype.close = function () {};
    w.BroadcastChannel.prototype.addEventListener = function () {};
    w.BroadcastChannel.prototype.removeEventListener = function () {};
  }

  // AbortSignal.timeout / any (Safari 16 / 17.4)
  if (w.AbortSignal && !AbortSignal.timeout) {
    AbortSignal.timeout = function (ms) {
      var controller = new AbortController();
      setTimeout(function () {
        controller.abort();
      }, ms);
      return controller.signal;
    };
  }
  if (w.AbortSignal && !AbortSignal.any) {
    AbortSignal.any = function (signals) {
      var controller = new AbortController();
      signals.forEach(function (signal) {
        if (signal.aborted) controller.abort();
        else
          signal.addEventListener('abort', function () {
            controller.abort();
          });
      });
      return controller.signal;
    };
  }

  // Element.replaceChildren (Safari 14)
  if (w.Element && !Element.prototype.replaceChildren) {
    var replace = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      for (var i = 0; i < arguments.length; i++) {
        var node = arguments[i];
        this.appendChild(typeof node === 'string' ? document.createTextNode(node) : node);
      }
    };
    Element.prototype.replaceChildren = replace;
    if (w.DocumentFragment) DocumentFragment.prototype.replaceChildren = replace;
  }

  // requestIdleCallback (not in Safari at all)
  if (!w.requestIdleCallback) {
    w.requestIdleCallback = function (callback) {
      var start = Date.now();
      return setTimeout(function () {
        callback({
          didTimeout: false,
          timeRemaining: function () {
            return Math.max(0, 50 - (Date.now() - start));
          },
        });
      }, 1);
    };
    w.cancelIdleCallback = function (id) {
      clearTimeout(id);
    };
  }

  // ResizeObserver (Safari 13.1): the sizes are looked at on every animation frame while anything
  // is observed. Few things are observed on a page, so this costs little.
  if (!w.ResizeObserver) {
    w.ResizeObserver = function ResizeObserver(callback) {
      this._callback = callback;
      this._items = [];
      this._frame = 0;
    };
    var RO = w.ResizeObserver.prototype;
    RO._tick = function () {
      var self = this;
      var changed = [];
      this._items.forEach(function (item) {
        var rect = item.target.getBoundingClientRect();
        if (rect.width !== item.width || rect.height !== item.height) {
          item.width = rect.width;
          item.height = rect.height;
          changed.push({
            target: item.target,
            contentRect: rect,
            borderBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
            contentBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
          });
        }
      });
      if (changed.length) {
        try {
          this._callback(changed, this);
        } catch (e) {
          setTimeout(function () {
            throw e;
          });
        }
      }
      this._frame = this._items.length
        ? requestAnimationFrame(function () {
            self._tick();
          })
        : 0;
    };
    RO.observe = function (target) {
      for (var i = 0; i < this._items.length; i++) if (this._items[i].target === target) return;
      // Report the first size at once, as a ResizeObserver does.
      this._items.push({ target: target, width: -1, height: -1 });
      if (!this._frame) {
        var self = this;
        this._frame = requestAnimationFrame(function () {
          self._tick();
        });
      }
    };
    RO.unobserve = function (target) {
      this._items = this._items.filter(function (item) {
        return item.target !== target;
      });
    };
    RO.disconnect = function () {
      this._items = [];
      if (this._frame) cancelAnimationFrame(this._frame);
      this._frame = 0;
    };
  }

  // createImageBitmap (Safari 15): enough for the pictures the app decodes with it.
  if (!w.createImageBitmap) {
    w.createImageBitmap = function (source) {
      return new Promise(function (resolve, reject) {
        if (source instanceof Blob) {
          var url = URL.createObjectURL(source);
          var image = new Image();
          image.onload = function () {
            URL.revokeObjectURL(url);
            image.close = function () {};
            resolve(image);
          };
          image.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('Could not decode the image'));
          };
          image.src = url;
        } else {
          resolve(source);
        }
      });
    };
  }

  // <dialog> (Safari 15.4). A dialog shows while it has the `open` attribute; showModal also puts it
  // above everything with a dark curtain behind, and Escape closes it.
  var style = document.createElement('style');
  style.textContent =
    'dialog:not([open]){display:none}' +
    'dialog{position:absolute;left:0;right:0;margin:auto;border:solid;padding:1em;background:#fff;color:#000}' +
    'dialog[data-modal]{position:fixed;z-index:2147483000}' +
    '.dialog-curtain{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:2147482999}';
  document.head.appendChild(style);
  var probe = document.createElement('dialog');
  if (typeof probe.showModal !== 'function') {
    var proto =
      (w.HTMLDialogElement && HTMLDialogElement.prototype) || HTMLUnknownElement.prototype;
    var curtains = [];
    var closeDialog = function (dialog, value) {
      if (!dialog.hasAttribute('open')) return;
      dialog.removeAttribute('open');
      dialog.removeAttribute('data-modal');
      if (value !== undefined) dialog.returnValue = value;
      var index = -1;
      for (var i = 0; i < curtains.length; i++) if (curtains[i].dialog === dialog) index = i;
      if (index >= 0) {
        var curtain = curtains.splice(index, 1)[0].node;
        if (curtain.parentNode) curtain.parentNode.removeChild(curtain);
      }
      dialog.dispatchEvent(new Event('close'));
    };
    Object.defineProperty(proto, 'open', {
      get: function () {
        return this.hasAttribute('open');
      },
      set: function (value) {
        if (value) this.setAttribute('open', '');
        else this.removeAttribute('open');
      },
      configurable: true,
    });
    proto.show = function () {
      this.setAttribute('open', '');
    };
    proto.showModal = function () {
      this.setAttribute('open', '');
      this.setAttribute('data-modal', '');
      var node = document.createElement('div');
      node.className = 'dialog-curtain';
      var dialog = this;
      node.addEventListener('click', function () {});
      document.body.appendChild(node);
      curtains.push({ dialog: dialog, node: node });
    };
    proto.close = function (value) {
      closeDialog(this, value);
    };
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !curtains.length) return;
      var top = curtains[curtains.length - 1].dialog;
      var cancel = new Event('cancel', { cancelable: true });
      top.dispatchEvent(cancel);
      if (!cancel.defaultPrevented) closeDialog(top);
    });
  }
})();
