Solid Fuel Socket Booster
===

> A combination WebSocket, Ajax, and WebWorker library.

SFSB supercharges a WebSockets and ajax server polling by running your code
within a web worker and allowing you to process the data it hands you within
that worker before sending the data back to the main thread.

Compatibility
-------------

SFSB is compatible with IE10+ and all recent versions of Firefox and Chrome.
Further backward compatibility with IE would be self-defeating in that you
would have to fake the web worker API, run that code in your main application
thread, and thus defeat the whole point of the library.

Setup
-----

The library is built using Gulp and Browserify. Just plug it in and you're
good to go.

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
for you using the magic of the `Blob` and `createObjectURL`. Essentially, you'll
never have to worry about interfacing with the web worker at all. Here's what
you do instead:

### WebSockets

The idea here is that you will create a `new SF.socketBooster` and hand it two
things: a websocket url and, optionally, a function that will be used to process
data received from the websocket:

```javascript
var socket = new SF.socketBooster('ws://echo.websocket.org', function (data) {
  return data + '!!!';
});
```

In this example, we set up a websocket connection to an echo server. Whatever
we send to this server will be echoed back. Don't forget, this socket is
running inside a web worker. We also passed in a function that will be executed
within that web worker instead of within the main application thread.
This function takes the data given to us by the socket and adds "!!!" to the
end of it. Having been processed, this data will now be sent back to our
main thread.

> **Note:** Because your processor function runs inside the web worker, it will
> not have access to any closure data from your main thread. It must be
> entirely independent of any outside state.

In order to get data back out of our socket, we'll add an event listener
to it:

```javascript
socket.addEventListener('message', function (evt) {
  console.log('The message was', evt.data);
});
```

The above call registers a function to be run whenever we receive a message
back from our socket worker.

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

### Ajax

In the case of ajax server polling, the whole point is that you don't have
websockets available and you therefore need to continually make requests to the
server to retrieve potentially new data. This, of course, can become taxing on
your main thread so SFSB gives you a way to set up a convenient ajax poller in
a web worker.

Begin by creating a `new SF.ajaxPoller` and handing it a somewhat
familiar-looking ajax settings object:

```javascript
var ajax = new SF.ajaxPoller({
  url: 'http://www.example.com',
  timeout: 10000,
  frequency: 30000,
  headers: {},
  data: {},
  process: function (data) {}
});
```

In this example we can see all of our available options. Because you are polling
the server for updates, there is no need to specify the request method. It will
be "GET" by default. Following are the meanings of each setting. Note that
only `url` is required. All others are optional.

- `url` - The url of the server where requests will be made.
- `timeout` - How long any given request should wait before timing out. The
default is 10000 (or 10 seconds).
- `frequency` - How often to poll the server. The default is 30000 (or every
30 seconds).
- `headers` - Where each key is a header name and each value is a header value.
This is where you can add CSRF tokens, for example.
- `data` - Any data that should be sent to the server along with the request.
- `process` - A function that will be used to process data in the event of a
successful response. Whatever this function returns will be passed back to the
main application thread.

> **Note:** Because your `process` function runs inside the web worker, it will
> not have access to any closure data from your main thread. It must be
> entirely independent of any outside state.

To receive data back from your ajax requests, simply add event listeners to you
ajax poller:

```javascript
ajax.addEventListener('success', function (data) {
  console.log('I received:', data);
});
```

You can add event listeners for any of three events: `success`, `error`, and
`message`.

Success listeners will only run when the ajax request returns a request with
a status in the 200-299 range.

Error listeners will run when the response gives us a status outside the 200s
or otherwise produces an error,  when the web worker produces an error, and
when the request times out.

Message listeners will run whenever the worker hands us anything. This happens
on both `success` and `error` events.

Sometimes you may find yourself needing to send a PUT/POST/DELETE request to
the same server you are polling for updates. In that case, you can call any
of the `put`, `post`, or `del` methods on the ajax poller. For example:

```javascript
ajax.post({
  data: {},
  headers: {},
  timeout: 10000
});
```

Notice that when using any of these methods, you only have the ability to
specify a timeout, new headers, and data specific to the request. If you choose
not to specify any given one of these settings, it will use the defaults
you provided when you initially created your ajax poller.

Note that PUT/POST/DELETE requests happen independently of your GET polling.
In other words, polling will still continue in the background while your new
request is open and polling frequency will not be interrupted by a response from
your new request. For instance, you may be polling a server every 30 seconds
and then, 15 seconds in, you might make a POST request. Assuming that POST
returns fairly quickly, your success listeners will pick up on the response
from that POST and then 15 seconds later, pick up on the response from the
next poll.

TODO
----

- Periodically refresh ajax workers to clear out memory
- Add ways to manually kill sockets and ajax workers
- Maybe add ways to revive dead sockets and ajax workers












