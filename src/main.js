
var global    = window,
    secretary = require('./secretary'),
    wstask,
    pltask;

/**
 * Converts data into query string format.
 * Intended to be stringified and run within a Web Worker.
 *
 * @param {Object|String} data - Data to be converted.
 *
 * @returns {String} - In the format of a url query string.
 */
function stringify(data) {
  var output = '';

  /*
   * If the data is already a string, return it.
   */
  if (typeof data === 'string') {
    return data;
  }

  /*
   * Iterate over the values and convert them
   * into the &param=value format.
   */
  Object.keys(data).forEach(function (key) {
    var value = data[key];

    /*
     * If the value is some kind of object, iterate over it
     * and appropriately create values.
     */
    if (typeof value === 'object') {

      /*
       * Create array items.
       */
      if (Array.isArray(value)) {
        value.forEach(function (arrItem) {
          output += ('&' + key + '[]=' + encodeURIComponent(arrItem));
        });

      /*
       * Create object values.
       */
      } else {
        Object.keys(value).forEach(function (subKey) {
          output += ('&' + key + '{' + subKey + '}=' + encodeURIComponent(value[subKey]));
        });
      }

    /*
     * Otherwise, create a value simply.
     */
    } else {
      output += ('&' + key + '=' + encodeURIComponent(value));
    }
  });

  /*
   * Slice the unnecessary '&' off of the beginning.
   */
  return output.slice(1);
}

/**
 * Creates an ajax request.
 * Intended to be stringified and run within a Web Worker.
 *
 * @param {Object} settings - A settings object for ajax.
 *
 * @key {String} url       - The request URL.
 * @key {String} type      - The REST method. Defaults to 'GET'.
 * @key {Object} data      - Data to send with the request.
 * @key {Number} timeout   - How long before the request gives up.
 * @key {Number} frequency - How often to poll the server.
 * @key {Object} headers   - Defaults to native defaults. Should
 *                           be in the format of {contentType: 'text/plain'}
 *
 * @returns {undefined}
 */
function createXHR(settings) {
  var req    = new XMLHttpRequest(),
      method = (settings.type ? settings.type.toUpperCase() : 'GET'),
      url,
      data,
      timer;

  /*
   * Stringify any data being sent.
   */
  Object.prototype.hasOwnProperty.call(settings, "data") &&
    (data = stringify(settings.data));

  /*
   * Add in the question mark for GET requests.
   */
  method === 'GET' && (data = '?' + data);

  /*
   * Attach query strings to the URL for a GET request.
   */
  url = settings.url + (method === 'GET' ? (data || '') : '');

  /*
   * Open the request asynchronously using either
   * the user-provided method or 'GET'.
   */
  req.open(method, url, true);

  /*
   * Prepare the request to send encoded data.
   * Users will be able to override this.
   */
  req.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

  /*
   * Add user-supplied headers.
   */
  Object.prototype.hasOwnProperty(settings, "headers") &&
    Object.keys(settings.headers).forEach(function (key) {
      req.setRequestHeader(key, settings.headers[key]);
    });

  /*
   * Send the request. Include data if appropriate.
   */
  req.send(method === 'POST' || method === 'DELETE' || method === 'PUT' ? (data || null) : null);

  /*
   * Initialize a timer so the request will die if it takes too long.
   */
  timer = setTimeout(function () {
    req.abort();
    self.postMessage({"result"   : "error",
                      "response" : "timeout",
                      "status"   : xhr.status});
  }, 10000 || settings.timeout || req.timeout);

  /*
   * Once the request has loaded...
   */
  req.addEventListener('load', function (evt) {
    var status = parseInt(evt.srcElement.status);

    /*
     * Clear the timer.
     */
    clearTimeout(timer);

    /*
     * If the request status does not fall into the successful range,
     * reject the promise.
     */
    if (status < 200 || status > 299) {
      self.postMessage({"result"   : "error",
                        "response" : evt.srcElement.response,
                        "status"   : evt.srcElement.status});

    /*
     * In the event of a good result, process that result and hand it back.
     */
    } else {
      self.postMessage({"result"   : "success",
                        "response" : (process
                                        ? process(evt.srcElement.response)
                                        : evt.srcElement.response),
                        "status"   : evt.srcElement.status});

    }
  });

  /*
   * If the request errors out, clear the timer and
   * reject the promise.
   */
  req.addEventListener('error', function (evt) {
    clearTimeout(timer);
    self.postMessage({"result"   : "error",
                      "response" : evt.srcElement.response,
                      "status"   : evt.srcElement.status});
  });

  /*
   * The purpose of this worker is to continue to poll the server
   * every so often so, if this wasn't a PUT/POST/DELETE, countdown
   * and then make another request.
   */
  return method === "GET" && setTimeout(function () {
    createXHR(settings);
  }, settings.frequency || 30000);
}

/**
 * Define what will be the job of a poller we create.
 * After creating a poller, we can interface with it as if it was
 * a WebSocket.
 *
 * Sending data to it will initiate a PUT/POST/DELETE after which time
 * it will go back to polling with GET
 */
pltask = 'function () {'

       + '  var globals = {{GLOBALS}},'
       + '      process = {{PROCESS}};'

            /*
             * Make sure ajax workers can use our stringify function.
             */
       +    stringify.toString()

            /*
             * Make sure ajax workers can use our xhr function.
             */
       +    createXHR.toString()

            /*
             * Use our global config to start polling.
             */
       + '  createXHR(globals);'

            /*
             * When the user sends us a message, make an ajax request.
             * `msg` should be a settings object.
             */
       + '  return function (msg) {'
       + '    msg.url = globals.url;'
       + '    !msg.timeout && (msg.timeout = globals.timeout);'
       + '    !msg.headers && (msg.headers = globals.headers);'
       + '    createXHR(msg);'
       + '  };'
       + '}'
       ;

/**
 * Define what will be the job of the worker we create.
 * Whenever we send a message to the worker, the worker will
 * hand that message to the socket.
 *
 * When a message comes in FROM the socket, {{CALLBACK}} will be
 * invoked to process the result. The processed result will then
 * be sent back to our main thread. 
 */
wstask = 'function () {'

            /*
             * Create a new WebSocket and track its original send method.
             */
       + '  var socket   = new WebSocket({{SOCKETURL}}),'
       + '      origSend = WebSocket.prototype.send,'
       + '      callback = {{CALLBACK}};'
       
            /*
             * Overwrite the send method to compensate for the potential race
             * conditions where sockets have to be asynchronously opened
             * before messages can be sent.
             */
       + '  WebSocket.prototype.send = function (msg) {'
       + '    if (this.readyState !== 1) {'
       + '      return setTimeout(function () {this.send(msg)}.bind(this), 10);'
       + '    }'
       + '    return origSend.call(this, msg);'
       + '  };'

            /*
             * When we get a message from the socket, process it and
             * pass it back to the user.
             */
       + '  socket.onmessage = function (msg) {'
       + '    self.postMessage(callback ? callback(msg.data) : msg.data);'
       + '  };'
      
            /*
             * When the user sends us a message, pass it along to the socket.
             */
       + '  return function (msg) {'
       + '    socket.send(msg);'
       + '  };'
       + '}'
       ;


/**
 * @constructor
 *
 * Generates an object for interfacing with a WebSocket through
 * a web worker: a Solid Fuel Socket Booster.
 *
 * @param {String}   url - The websocket url.
 * @param {Function} cb  - Optional. A callback for how the worker should
 *                         process messages it receives from the socket.
 *                         Note that this function will become part of the
 *                         web worker therefore will not have access to any
 *                         closure data. It must be completely independent.
 *                         When executed, it will be given the worker object
 *                         as its context.
 *
 * @returns {undefined}
 */
function SFSB(url, cb) {
  var worker       = secretary(),
      specificTask = wstask.replace('{{SOCKETURL}}', '"' + url + '"')
                           .replace('{{CALLBACK}}', cb?cb.toString():'null');
  
  /*
   * Give the worker its job.
   */
  worker.postJob(specificTask, true);

  /*
   * Store the worker.
   */
  this.worker = worker;
}

/**
 * The methods of the SFSB object.
 */
SFSB.prototype = {

  /**
   * Send a message through the socket in the worker.
   *
   * @param msg - The message to send.
   */
  "send" : function (msg) {
    this.worker.postMessage(msg);
    return this;
  },

  /**
   * Close the worker and by extension the socket.
   */
  "close" : function () {
    this.worker.close();
    return this;
  },

  /**
   * Listen for events on the socket in the worker.
   */
  "addEventListener" : function (evt, fn) {
    this.worker.addListener(evt, fn);
    return this;
  }
};

/**
 * @constructor
 *
 * Creates an object for polling a server inside a Web Worker:
 * a Solid Fuel Ajax Poller.
 *
 * @param {Object} settings - A settings object for ajax.
 *
 * @key {String}   url       - The request URL.
 * @key {Object}   data      - Data to send with GET requests.
 * @key {Number}   timeout   - How long before the request gives up. Defaults to 10000.
 * @key {Number}   frequency - How often to poll the server. Defaults to 30000.
 * @key {Function} process   - A function for processing successful data.
 * @key {Object}   headers   - Defaults to native defaults. Should
 *                             be in the format of {contentType: 'text/plain'}
 *
 * @returns {undefined}
 */
function SFAP(settings) {
  var worker, specificTask;

  /*
   * Don't let users poll with posts, etc.
   */
  settings.type = 'GET';

  /*
   * Create a worker and its associated task.
   */
  worker       = secretary();
  specificTask = pltask.replace('{{GLOBALS}}', JSON.stringify(settings))
                       .replace('{{PROCESS}}', settings.process ? settings.process.toString() : 'null');

  /*
   * Give the worker its job.
   */
  worker.postJob(specificTask, true);

  /*
   * Add a message event listener. When we get a message back from the worker,
   * invoke all callbacks for that kind of message.
   */
  worker.addListener('message', function (msg) {
    this['on' + msg.data.result].forEach(function (callback) {
      callback(msg.data);
    });
    this.onmessage.forEach(function (callback) { callback(msg.data) });
  }.bind(this));

  /*
   * Add an error event listener. When the worker reports an error, invoke
   * error callbacks.
   */
  worker.addListener('error', function (msg) {
    var toPass = {"result" : "error", "response" : msg, "status" : -1};
    this.onerror.forEach(function (callback) { callback(toPass) });
    this.onmessage.forEach(function (callback) { callback(toPass) });
  });

  /*
   * Store the worker and other important info.
   */
  this.worker    = worker;
  this.settings  = settings;
  this.onsuccess = [];
  this.onerror   = [];
  this.onmessage = [];
}

/**
 * The methods of the SFAP object.
 */
SFAP.prototype = {

  /**
   * Send a POST request to the poller. Does not interrupt polling.
   * Can not use a different URL than the URL being polled. All other
   * settings may be overwritten.
   */
  "post" : function (settings) {
    msg.type = 'POST';
    this.worker.postMessage(msg);
    return this;
  },

  /**
   * Send a PUT request to the poller. Does not interrupt polling.
   * Can not use a different URL than the URL being polled. All other
   * settings may be overwritten.
   */
  "put" : function (settings) {
    msg.type = 'PUT';
    this.worker.postMessage(msg);
    return this;
  },

  /**
   * Send a DELETE request to the poller. Does not interrupt polling.
   * Can not use a different URL than the URL being polled. All other
   * settings may be overwritten.
   */
  "del" : function (settings) {
    msg.type = 'DELETE';
    this.worker.postMessage(msg);
    return this;
  },

  /**
   * Allow users to listen for success, error, and message events
   * so that they can run callbacks in those cases. The "message"
   * event essentially equates to an "always" callback.
   */
  "addEventListener" : function (evt, callback) {
    this['on' + evt.toLowerCase()].push(callback);
    return this;
  }
};

/**
 * Assign this sucker to the global scope.
 */
global.SF = {
  "socketBooster" : SFSB,
  "ajaxPoller"    : SFAP
};
