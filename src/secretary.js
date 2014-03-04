
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