# TODO

 - create redis-wstream - which is a write stream which stores binary stream in redis key. It calls end with the length that it stored.
 - create redis-rstream - which is a read stream which reads binary stream from redis key in chunks. It calls end with the length that was read.
 - create gzip-stream - which is a through stream (RW) which gzips binary data from input to its output, it calls end with the length of the compressed stream
 - create gunzip-stream - which is a through stream (RW) which gzips binary data from input to its output, it calls end with the length of the uncompressed stream
 - create digest-stream - which is a through stream (RW) which performs a digest on the data as it passes through, and it provides the result and length to end
 - create length-stream - simple through stream which provides the length on end

 each of these could have optional cb provided during construction to make it easier to get the resultant data

 var digest;
 var digestStream = digestStream.create('sha1', 'base64', function (resultDigest) {
   digest = resultDigest;
});

 vs

 var digestStream = digestStream.create('sha1', 'base64').on('end', function (resultDigest) {
   digest = resultDigest;
 });


both can work, however the first has the advantage of being able to do the following

var digest;
function digestListener(resultDigest) {
  digest = resultDigest;
});

instream
  .pipe(digestStream.create('sha1', 'base64', digestListener))
  .pipe(gzipStream);


 instream
   .pipe(digestStream)
   .pipe(gzipStream)
   .pipe(redis-wstream)
   .on('end', function (length) {
     // use digest and length
   });



 - gzip in stream not implemented yet
 - consolidate to use through stream instead of memorystream

 - http PUT with setting modtime, contentType, calc etag & length
 - PUT markdown, generate HTML and save, set srcid
 - publish individual file
 - review list of unpublished, publish that list
 - store compressed gzip, so stream it directly, otherwise if client doesnt support ungzip before sending. Use meta to specify the content encoding.
 - set expires date
