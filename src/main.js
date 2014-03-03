
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
task  = '(function () {'

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
      + '}())'
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
  worker.postJob(specificTask);

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
