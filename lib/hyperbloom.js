'use strict';

const assert = require('assert');
const path = require('path');
const debug = require('debug')('hyperbloom');
const sodium = require('sodium-universal');
const swarm = require('discovery-swarm');
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

  this.id = Buffer.alloc(constants.ID_SIZE);
  sodium.randombytes_buf(this.id);

  this.trust = new Trust(Object.assign({
    publicKey: this.options.publicKey,
    privateKey: this.options.privateKey
  }, this.options.trust));

  this.nodes = new Map();

  this.swarm = swarm({
    stream: info => this._createStream(info)
  });
}
module.exports = HyperBloom;

HyperBloom.prototype.listen = function listen(port, callback) {
  if (typeof port === 'function') {
    callback = port;
    port = 0;
  } else if (port === undefined) {
    port = 0;
  }

  let onError;

  const done = () => {
    this.swarm.removeListener('error', onError);
    if (callback)
      callback(null);
  };

  onError = (err) => {
    // Retry on non-random port
    if (port === 0)
      this.swarm.listen(PORT, done);
  };

  this.swarm.listen(port, done);
  this.swarm.once('error', onError);
};

HyperBloom.prototype.close = function close(cb) {
  let waiting = 2;

  const done = () => {
    if (--waiting === 0)
      return cb();
  };

  this.swarm.close(done);
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

  if (this.nodes.has(feedKey))
    return process.nextTick(callback, null, this.nodes.get(feedKey));

  this.trust.getChain(feedKey, (err, chain) => {
    if (err)
      return callback(err);

    const discoveryKey = this._discoveryKey(feedKey);
    const hexKey = discoveryKey.toString('hex');

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
    this.nodes.set(hexKey, node);

    this.swarm.join(discoveryKey);

    callback(null, node);
  });
};

HyperBloom.prototype.leave = function leave(feedKey) {
  const discoveryKey = this._discoveryKey(feedKey);
  const hexKey = discoveryKey.toString('hex');

  this.swarm.leave(discoveryKey);
  const node = this.nodes.get(hexKey);
  this.nodes.delete(hexKey);

  if (node)
    return node.close();
};

HyperBloom.prototype.addLink = function addLink(root, link) {
  this.trust.addChain(root, [ link ], (err) => {
    if (err)
      debug('addLink error=%s', err.message);
  });
};

// Private

HyperBloom.prototype._discoveryKey = function _discoveryKey(input) {
  const out = Buffer.alloc(HASH_SIZE);
  sodium.crypto_generichash(out, input, HASH_KEY);
  return out;
};

HyperBloom.prototype._createStream = function _createStream(info) {
  debug('connection host=%s port=%d type=%s', info.host, info.port,
        info.type);

  const stream = new Stream({ id: this.id });

  stream.once('error', (err) => {
    debug('stream err=%s', err.message);
    stream.destroy();
  });

  stream.once('secure', ({ id }) => {
    // For `discovery-swarm`
    stream.emit('handshake', id);
  });

  const onFeed = (feed) => {
    const feedHex = feed.toString('hex');

    // Unknown channel (should not happen, though, since we created this)
    if (!this.nodes.has(feedHex)) {
      debug('stream feed\'s unknown feed=%s', feedHex);
      return stream.destroy();
    }

    this.nodes.get(feedHex).addStream(stream);
  };

  if (info.initiator)
    onFeed(info.channel);
  else
    stream.once('open', ({ feed }) => onFeed(feed));

  return stream;
};
