(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

var global    = window,
    secretary = require('./secretary'),
    task;

/**
 * Define what will be the job of the worker we create.
 * Whenever we send a message to the worker, the worker will
 * hand that message to the socket.
 *
 * When a message comes in FROM the socket, {{CALLBACK}} will be
 * invoked to process the result. The processed result will then
 * be sent back to our main thread. 
 */
task  = 'function () {'

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
 * a web worker.
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
      specificTask = task.replace('{{SOCKETURL}}', '"' + url + '"')
                         .replace('{{CALLBACK}}', cb ? cb.toString() : 'null');
  
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
    return this.worker.postMessage(msg);
  },

  /**
   * Close the worker and by extension the socket.
   */
  "close" : function () {
    return this.worker.close();
  },

  /**
   * Listen for events on the socket in the worker.
   */
  "addEventListener" : function (evt, fn) {
    return this.worker.addListener(evt, fn);
  }
};

/**
 * Assign this sucker to the global scope.
 */
global.SFSB = SFSB;

},{"./secretary":2}],2:[function(require,module,exports){

/**
 * Creates a special genius web worker.
 */

var workerBlob,
    global = window;

/**
 * The body of our custom Web Worker. It expects to receive messages
 * in the form of JSON objects, each containing `label` and `msg`.
 *
 * `label` describes the kind of message the message is.
 * `msg` holds the actual message.
 *
 * Messages of the type 'job' expect the message to be in the form of
 * function components. (See `fnComponents`). The purpose of 'job' is to
 * tell the worker exactly what it should do with messages it receives.
 *
 * Messages of the type 'cmd' are immediately evaluated in the context
 * of the worker itself and can therefore be used to tell the worker to
 * run commands on itself such as `self.close()`.
 *
 * Messages of the type `message` are considered standard messages that
 * are passed as arguments to the worker's job function. The return is
 * then passed back to the main thread.
 */
function workerBody() {
  var that = this, lambda, evalInContext, handleErr;

  /*
   * Evaluates code within a custom context. This is not
   * used in our main application thread and happens only when
   * when we assign a job to a real Web Worker. Thus it does not
   * hurt performance in our main thread and doesn't make any more use
   * of the interpreter than `importScripts` would.
   */
  evalInContext = function (ctx, src) {
    var newSrc = new Function('return ' + src + ';');
    return newSrc.call(ctx);
  };

  /*
   * When we receive a message, determine what to do with it.
   */
  this.onmessage = function (evt) {
    var job;
    switch (evt.data.label) {
      case "job" :
        job = new Function(evt.data.msg.params[0], evt.data.msg.body)
        return (lambda = evt.data.msg.immediate ? job() : job);
      case "cmd"     : return evalInContext(that, evt.data.msg.body);
      case "message" : return lambda(evt.data.msg);
      case "close"   : return self.close();
    }
  };
}

/**
 * A blob that can be converted into a Web Worker.
 */
workerBlob = new Blob([fnComponents(workerBody).body], {type: "text/javascript"});

/**
 * Stringifies a function and divides it into two pieces:
 * `body` - the function body.
 * `params` - an array of parameter name strings.
 *
 * @param {Function} fn          - The function to divide up.
 * @param {Boolean}  isImmediate - If true, the function should be
 *                                 executed immediately.
 *
 * @returns {Object} - Contains the function components.
 */
function fnComponents(fn, isImmediate) {
  var str;
  fn  = (typeof fn === 'function' ? fn.toString() : fn);
  str = fn.replace(/^function\s*[^\(]*\s*\(/, '');
  return {
    "body"      : str.replace(/^[^\)]*\)\s*\{|\}$/g, ''),
    "immediate" : !!isImmediate,
    "params"    : str.replace(/\s+/g, '')
                     .replace(/\).*$/, '')
                     .split(',')
  };
}

/**
 * Creates a Web Worker and returns an API for interacting with it.
 *
 * @returns {Object} - The custom worker API.
 */
function createWorker() {
  var worker = new Worker(window.URL.createObjectURL(workerBlob)),
      messageHook = [],
      errorHook = [],
      closeHook = [];

  /*
   * When the worker sends us a message, do stuff...
   */
  worker.onmessage = function (evt) {
    messageHook.forEach(function (fn) { fn(evt) });
  };

  /*
   * When the worker sends an error, do stuff...
   */
  worker.onerror = function (evt) {
    errorHook.forEach(function (fn) { fn(evt) });
  };

  /*
   * When the worker sends an error, do stuff...
   */
  worker.onclose = function (evt) {
    closeHook.forEach(function (fn) { fn(evt) });
  };

  /*
   * Return the interactions.
   */
  return {

    /**
     * Allow the user to add event listeners to the worker.
     *
     * @param {String}   evtName - The event to listen for.
     * @param {Function} fn      - The listener function.
     * 
     * @returns {Number} - The new amount of listeners for the hook.
     */
    "addListener" : function (evtName, fn) {
      switch (evtName) {
        case 'message' : messageHook.push(fn); break;
        case 'error'   : errorHook.push(fn); break;
      }
      return this;
    },

    /**
     * Allows you to tell a worker how to work.
     *
     * @param {Function} fn          - The worker's body of code.
     * @param {Boolean}  isImmediate - If true, the job should be executed
     *                                 immediately upon transfer. This is
     *                                 mainly for when your job is actually a closure
     *                                 that needs to return the real job.
     *
     * @returns - The api.
     */
    "postJob" : function (fn, isImmediate) {
      worker.postMessage({
        label: 'job',
        msg: fnComponents(fn, isImmediate)
      });
      return this;
    },

    /**
     * Allows you to pass a special command such as `self.close` to the worker.
     *
     * @param {Function} fn - A function containing the command. It is called
     *                        in the context of the worker from within the worker.
     *
     * @returns - The api.
     */
    "postCmd" : function (fn) {
      worker.postMessage({
        label: 'cmd',
        msg: fnComponents(fn)
      });
      return this;
    },

    /**
     * Allows you to pass a message to the worker.
     *
     * @param message - The message to pass.
     *
     * @returns - The api.
     */
    "postMessage" : function (message) {
      worker.postMessage({
        label: 'message',
        msg: message
      });
      return this;
    },

    /**
     * A softer way to terminate workers from the outside.
     * Attempts to tell the woker to close itself but if that doesn't
     * happen, then terminates the worker.
     *
     * @param {Number} time - The amount of time to give the worker to close
     *                        itself before manually terminating it. Default
     *                        is 100ms;
     *
     * @returns {undefined}
     */
    "end" : function (time) {
      var closed = false;
      this.addListener('close', function () { closed = true });
      setTimeout(function () { !closed && worker.terminate() }, 100 || time);
      this.postCmd(function () { self.close() });
    }
  };
}

/**
 * Export module code.
 */
module.exports = createWorker;
},{}]},{},[1])