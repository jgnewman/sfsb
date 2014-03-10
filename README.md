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

In this example we can see almost all of our available options. The two options
not shown are called `backoff` and `refresh` but we'll get to those later.
Anyway, because you are polling the server for updates, there is no need to
specify the request method. It will be "GET" by default. Following are the
meanings of each setting. Note that only `url` is required. All others are
optional.

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
  console.log('I received:', data.response);
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

#### Incremental Backoff

Now let's say you didn't need to poll the server exactly once every X seconds.
For various reasons, you might want to be able to control the amount of time
between polls based, for example, on the information you received from a
previous request.

In this case, you have the option of passing in a function for your
`backoff` setting. This function will take the same response data that ends
up getting sent back to the main thread and ought to return a number in
milliseconds. This number will be used as the length of time to wait before
making the next ajax poll. For example:

```javascript
var ajax = new SF.ajaxPoller({
  url: 'http://www.example.com',
  frequency: 3000,
  backoff: function (data) {
    return data.prevFreq + 5000;
  }
});
```

In this case, every time a failed response comes back, our frequency function
will run. Within the data it receives is a value representing how long the
worker waited before making the previous poll. So in the event of a failed
response, we'll wait that long plus 5 additional seconds before making the
next poll. As soon as the response comes back successfully, our initial
frequency setting will kick back in at `3000` where it will remain until we
get another failed response.

Here is all the data available both within a backoff function and within
your success, error, and message listeners:

- `success` - _Boolean._ Whether or not the request was successful.
- `response` - _String._ The response text.
- `status` - _Number._ The xhr status code.
- `prevFreq` - _Number._ The length of the delay before making this request.
- `duration` - _Number._ The amount of time it took for the request to complete.
- `sent` - _Object._ The data that was sent to the server on this request.
- `utf8Bytes` - _Number._ Assuming the response text is utf-8, the byte size of
the response text.

#### Refreshing

Constant polling can be a taxing job. Even with incremental backoff, there are
certain occasions where it is useful to clear out the memory accumulated by a
polling mechanism and its associated call stack. That's what your `refresh`
setting is for. If you would like, you can tell your ajax poller that after
every X number of requests, the web worker should destroy itself, thus cleaning
out memory and such, and then re-initialize itself with all of the same settings
that were initially passed in. For example:

```javascript
var ajax = new SF.ajaxPoller({
  url: 'http://www.example.com',
  frequency: 3000,
  refresh: 100
});

ajax.addEventListener('success', function (data) {
  console.log('I run when we have success!')
});
```

In this example, we tell our ajax poller that after making 100 requests, it
should refresh itself. Being an obedient little worker, it will count how many
requests it makes and, when it gets to 100, it will destroy itself and then
spin up another web worker with all the same settings to take its place.

The implication there is that your new worker will also have a request limit
set to 100 so that the refreshing cycle can continue. It is also important to
note that the event listener you created in connection with your original worker
now automatically applies to your new worker instead. Again, this is an instance
where you shouldn't have to think about the worker at all, just the polling
that takes place.

#### Updating

In some cases it's a good idea to modify your polling request as opposed to
creating multiple requests and this is especially true when dealing with web
workers. Imagine, for example, that you have an application that draws three
graphs on a page and therefore queries the server for data related to each of
your three graphs. Now imagine that your end user has the ability to hide or
show any of these three graphs at will. To reduce the server's load, you may
decide that while certain elements are invisible, you don't need to poll the
server for their data.

What updating essentially means, then, is that you will want to be able to
update the query parameters sent to the server and make your next query
immediately rather than waiting for the current polling delay to complete.

The way you do that in this case is as follows:

```javascript
var ajax = new SF.ajaxPoller({
  url: 'http://www.example.com',
  frequency: 2000,
  data: {foo: 'bar'}
});

setTimeout(function () {
  ajax.update({foo: 'bar', baz: 'quux'});
}, 5000);
```

Calling `.update` within context of a `setTimeout` is not necessary. It is shown
that way here to help explain what's going on.

In this case we set up an ajax poller to run every 2 seconds. Each time it runs,
it will send our `data` object to the server. Because our timer is set to 5
seconds, our original poll will run unmodified 3 times at 2 second intervals.
1 second after that third request, our timeout will expire and the data we are
sending to the server will be updated. Normally, the ajax poller would wait 1
more second before making the subsequent poll. However, since the request has
been updated, the next request is made immediately, and after that, it will be
2 more seconds before another request is made. After updating the poller, every
subsequent request will send the updated data to the server, even if the
worker is refreshed.

Note that if you have a backoff calculation in place, a request will still be
made immediately after updating the poller. However, unless a successful
response comes back from the server, your backoff calculation will remain
otherwise unaffected. For example, if your backoff calculation has gotten you
to the point that you are polling the server every 30 seconds and you decide
to update only half way through the delay, a request will be made immediately
but unless the response comes back successfully, it will still be 30 more
seconds before the next request is made.


TODO
----

- Test with the minified file
- Maybe add ways to revive dead sockets and ajax workers












