'use strict';

const assert = require('assert');
const path = require('path');
const debug = require('debug')('hyperbloom');
const sodium = require('sodium-universal');
const discoverySwarm = require('discovery-swarm');
const constants = require('hyperbloom-constants');
const Node = require('hyperbloom-node');
const Storage = require('hyperbloom-value-storage');
const Trust = require('hyperbloom-trust');
const Stream = require('hyperbloom-protocol').Stream;

const HASH_SIZE = constants.HASH_SIZE;
const HASH_KEY = constants.HASH_KEY;

function HyperBloom(options) {
  this.options = Object.assign({}, options);
  assert.equal(typeof this.options.storage, 'string',
               '`options.storage` must be a String');

  this.trust = new Trust(Object.assign({
    publicKey: this.options.publicKey,
    privateKey: this.options.privateKey
  }, this.options.trust));

  this.feeds = new Map();
}
module.exports = HyperBloom;

HyperBloom.prototype.listen = function listen(port, callback) {
  // NOTE: Just a compatibility method to avoid major version bump
  // TODO(indutny): remove it on next major
  if (typeof port === 'function')
    callback = port;

  if (callback)
    process.nextTick(callback);
};

HyperBloom.prototype.close = function close(callback) {
  let waiting = 1;
  const done = () => {
    if (--waiting === 0)
      return callback();
  };

  this.feeds.forEach((feed) => {
    waiting++;
    feed.swarm.close(done);
    feed.node.close();
  });
  this.trust.close(done);
};

HyperBloom.prototype.join = function join(feedKey, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = Object.assign({
    full: true
  }, options);

  if (this.feeds.has(feedKey))
    return process.nextTick(callback, null, this.feeds.get(feedKey).node);

  this.trust.getChain(feedKey, (err, chain) => {
    if (err)
      return callback(err);

    this._createFeed(feedKey, chain, options, callback);
  });
};

HyperBloom.prototype.leave = function leave(feedKey) {
  const discoveryKey = this._discoveryKey(feedKey);
  const hexKey = discoveryKey.toString('hex');

  const feed = this.feeds.get(hexKey);
  this.feeds.delete(hexKey);

  if (feed) {
    feed.swarm.close();
    feed.node.close();
  }
};

HyperBloom.prototype.addLink = function addLink(root, link) {
  this.trust.addChain(root, [ link ], (err) => {
    if (err)
      debug('addLink error=%s', err.message);
  });
};

// Private

HyperBloom.prototype._createFeed = function _createFeed(feedKey, chain,
                                                        options, callback) {
  const id = Buffer.alloc(constants.ID_SIZE);
  sodium.randombytes_buf(id);

  const discoveryKey = this._discoveryKey(feedKey);
  const hexKey = discoveryKey.toString('hex');

  // XXX(indutny): this is very inefficient, but it doesn't look like
  // this module may be used in any other way at the moment
  const swarm = discoverySwarm(Object.assign({}, this.options.discovery, {
    stream: info => this._createStream(hexKey, id, info)
  }));

  swarm.on('error', () => swarm.destroy());
  swarm.listen(() => {});

  let storage = null;
  if (options.full) {
    const file = path.join(this.options.storage, hexKey);
    storage = new Storage({
      backend: new Storage.backends.File(file)
    });
  }

  const node = new Node({
    full: options.full,
    feedKey,
    privateKey: this.options.privateKey,
    storage,
    trust: this.trust,
    chain
  });

  const onStorage = () => {
    debug('on storage');

    const feed = { id, node, swarm };
    this.feeds.set(hexKey, feed);

    swarm.join(discoveryKey);
    callback(null, feed.node);
  };

  if (storage)
    storage.load(onStorage);
  else
    process.nextTick(onStorage);
};

HyperBloom.prototype._discoveryKey = function _discoveryKey(input) {
  const out = Buffer.alloc(HASH_SIZE);
  sodium.crypto_generichash(out, input, HASH_KEY);
  return out;
};

HyperBloom.prototype._createStream = function _createStream(hexKey, id, info) {
  debug('connection host=%s port=%d type=%s', info.host, info.port,
        info.type);

  const stream = new Stream({ id });

  stream.once('error', (err) => {
    debug('stream err=%s', err.message);
    stream.destroy();
  });

  stream.once('secure', ({ id }) => {
    // For `discovery-swarm`
    stream.emit('handshake', id);
  });

  // Unknown channel (should not happen, though, since we created this)
  if (!this.feeds.has(hexKey)) {
    debug('stream feed\'s unknown feed=%s', hexKey);
    stream.destroy();
    return stream;
  }

  this.feeds.get(hexKey).node.addStream(stream);

  return stream;
};
