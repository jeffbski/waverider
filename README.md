# waverider CMS/blog

waverider CMS - lightweight fast CMS/blog with realtime edit and preview written in javascript for node.js

[![Build Status](https://secure.travis-ci.org/jeffbski/waverider.png?branch=master)](http://travis-ci.org/jeffbski/waverider)

## Installation

Requires node.js >= 0.8

```bash
npm install ## install dependent node modules
npm install hiredis  ## optional step if you want to use binary redis module
node lib/prepare-db.js  ## prepare the database
```

## Usage

```bash
node lib/server.js
```

## Goals

 - simple
 - lightweight
 - fast
 - highly scalable
 - collaborative realtime edit
 - review before publish
 - publish now and publish in the future
 - live preview
 - markdown content source format
 - binary content
 - open source - MIT license

## Planned Extensions

 - github integration
 - bitbucket integration
 - dropbox
 - S3

## Why build another CMS/blog?

I have not found a CMS/blog with my desired feature set that is also fast and simple. The evented nature of Node.js is a compelling platform for realtime delivery and scalability. I believe that building a lightweight CMS/blog architecture on Node.js will be more successfull (and enjoyable) than tring to retrofit an existing project.

This platform will allow me to use the latest technologies and practices, and even if this proves fruitless, it will nonetheless be a great experiment and learning space for testing out these new technologies.

## Planned technology stack

 - Node.js
 - Strata web framework
 - javascript
 - Redis
 - Operational transforms - sharejs
 - markdown with some extensions
 - socket.io for websocket support (with fallbacks or upgrades)
 - shared client/server code - allowing server-side and hijax single-page rendering
 - mocha + chaijs for testing

## Get involved

If you have input or ideas or would like to get involved, you may:

 - contact me via twitter @jeffbski  - <http://twitter.com/jeffbski>
 - open an issue on github to begin a discussion - <https://github.com/jeffbski/waverider/issues>
 - fork the repo and send a pull request (ideally with tests) - <https://github.com/jeffbski/waverider>

## License

 - [MIT license](http://github.com/jeffbski/waverider/raw/master/LICENSE)

