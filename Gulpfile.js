var gulp       = require('gulp'),
    gutil      = require('gulp-util'),
    browserify = require('gulp-browserify'),
    uglify     = require('gulp-uglify'),
    concat     = require('gulp-concat'),
    refresh    = require('gulp-livereload'),
    lr         = require('tiny-lr'),
    express    = require('express'),
    cmd        = require('child_process').exec,
    fs         = require('fs'),
    path       = require('path'),
    server     = lr();

/**
 * For Javascript, import all files from src/
 * then browserify them, concatenate them, and
 * write them to a file before refreshing the server.
 *
 * After that, minify and save the output in the dist folder.
 */
gulp.task('scripts', function () {
  gulp.src(['src/main.js'], {read: false})
      .pipe(browserify({baseDir: './'}))
      .pipe(concat('sfsb.js'))
      .pipe(gulp.dest('./dist'))
      .pipe(refresh(server));
});

/**
 * Create a task that minifies and writes out a minified
 * version of the code.
 */
gulp.task('distribute', function () {
  gulp.src('./dist/sfsb.js')
      // We can not mangle names in this case because the web worker
      // creation technique stringifies functions and compiles them
      // together. If their respective names get mangled, closure
      // data will become non-accessible.
      .pipe(uglify({mangle: false}))
      .pipe(concat('sfsb.min.js'))
      .pipe(gulp.dest('./dist/'));
});

/**
 * Create a livereload server.
 */
gulp.task('lr-server', function () {
  server.listen(35729, function (err) {
    if (err) {
      return gutil.log(err);
    }
  });
});

/**
 * Create a task for installing all deps.
 */
gulp.task('install', function () {
  fs.readFile('package.json', function (err, code) {
    var deps, command, child;
    if (err) {
      gutil.log(err);
      process.exit(1);
    }
    deps = JSON.parse(code.toString()).devDependencies;
    command = '';
    Object.keys(deps).forEach(function (moduleName) {
      command += ('npm install ' + moduleName + ' && ');
    });
    command = command.replace(/\s\&\&\s$/, '');
    child = cmd(command, function (err) {
      if (err) {
        gutil.log(err);
        process.exit(1);
      }
      gutil.log('Done.');
    });
    child.stdout.pipe(process.stdout);
  });
});

/**
 * Create a web server for testing.
 */
gulp.task('server', function () {
  var createServer = function(port) {
    var app = express();
    app.use(express.static(path.resolve('./')));
    app.listen(port, function() {
      gutil.log('Listening on', port);
    });
   
    gulp.run('default');
  };
  createServer(8080);
});

/**
 * Create a default task for running our
 * other tasks.
 */
gulp.task('default', function () {
  gulp.run('lr-server', 'scripts');

  gulp.watch(['./**/*',
              '!./node_modules/**/*',
              '!./package.json',
              '!./LICENSE',
              '!./README.md',
              '!./Gulpfile.js',
              '!./dist/*'], function (evt) {

    gutil.log(gutil.colors.cyan(evt.path), 'changed');
    gulp.run('scripts');
  });
});