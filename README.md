Solid Fuel Socket Booster
===

> A combination WebSocket and WebWorker library.

SFSB supercharges a WebSocket by running it within a web worker and allowing
you to process the data it hands you within that worker before sending the data
back to the main thread.

Setup
-----

The library is built using Gulp and Browserify and is therefore available
using Node and the browser. Just plug it in and you're good to go.

### For Development

1. Make sure you have Gulp installed: `npm install -g gulp`.
2. Clone this repository.
3. Navigate to the proper directory.
4. Install dependencies: `gulp install`.
5. Launch the live reload web server: `gulp server`.

Whenever you're ready go generate the minified output, call `gulp distribute`.

API
---

SFSB is extremely convenient in that it does not require you to write any new
JavaScript files in order to spawn your web worker. It takes care of all that
for you using the magic of the `Blob` and `createObjectURL`.

The idea is that you will create a `new SFSB` and hand it two things: a
websocket url and, optionally, a function that will be used to process data
received from the websocket:

```javascript
var socket = new SFSB('ws://echo.websocket.org', function (data) {
  return data + '!!!';
});
```

In this example, we set up a websocket connection to an echo server. Whatever
we send to this server will be echoed back. We also pass a function that will
be executed within the web worker instead of within the main application thread.
This function takes the data given to us by the socket and adds "!!!" to the
end of it. Having been processed, this data will now be sent back to our
main thread.

In order to get the data back out of our socket, we'll add an event listener
to it:

```javascript
socket.addEventListener('message', function (evt) {
  console.log('The message was', evt.data);
});
```

The above call registers a function to be run whenever we receive a message
back from our socket/worker.

At this point we can test whether or not everything is working by sending a
message to the socket. Even though the socket is running within a web worker,
we can interface with it as if it was just a regular socket. We don't have
to think about the web worker at all.

```javascript
socket.send('hello');
```

Having sent some data using `send`, that data is passed to the web worker which
then passes it straight along to the socket. The server on the other end is an
echo server so it sends the data back. Once the worker receives the echo, it
runs our data processor function which adds "!!!" to the end. Once this is
finished, the data is finally handed back to the main thread and picked up by
our event listener which logs to the console: `The message was hello!!!`.

More coming soon...

